import { Value } from "./value";
import { Equal } from "./value";
import { None } from "./value";
import { Tuple } from "./value";

// noCopy is zero-sized type that triggers vet's copylock check.
// See https://github.com/golang/go/issues/8005#issuecomment-190753527.
class noCopy {
  constructor() { }

  Lock(): void { }
  Unlock(): void { }
}

const bucketSize = 8;

function overloaded(elems: number, buckets: number): boolean {
  const loadFactor = 6.5; // just a guess
  return elems >= bucketSize && elems >= loadFactor * buckets;
}

class Bucket {
  entries: Entry[];
  next: Bucket | null; // linked list of buckets

  constructor() {
    this.entries = Array.from(
      { length: bucketSize },
      (_) => new Entry(0, null, null, null, null)
    );

    this.next = null;
  }
}

class Entry {
  hash: number; // nonzero => in use
  key: Value;
  value: Value;
  next: Entry | null; // insertion order doubly-linked list; may be null
  prevLink: Entry | null; // address of link to this entry (perhaps &head)

  constructor(
    hash: number,
    key: Value | null,
    value: Value | null,
    next: Entry | null,
    prevLink: Entry | null
  ) {
    this.hash = hash;
    // BUG:
    this.key = key!;
    this.value = value!;
    this.next = next;
    this.prevLink = prevLink;
  }
}

// hashtable is used to represent Starlark dict and set values.
// It is a hash table whose key/value entries form a doubly-linked list
// in the order the entries were inserted.
//
// Initialized instances of hashtable must not be copied.
export class Hashtable {
  table: Bucket[]; // len is zero or a power of two
  bucket0: Bucket[]; // inline allocation for small maps.
  len: number;
  itercount: number; // number of active iterators (ignored if frozen)
  head: Entry | null; // insertion order doubly-linked list; may be nil
  tailLink: Entry | null; // address of nil link at end of list (perhaps &head)
  frozen: boolean;

  _noCopy: noCopy; // triggers vet copylock check on this type.

  constructor(size?: number) {
    this.table = [];
    this.bucket0 = [new Bucket()];
    this.len = 0;
    this.itercount = 0;
    this.head = null;
    this.tailLink = null;
    this.frozen = false;

    this._noCopy = new noCopy();

    this.init(size || bucketSize);
  }

  private init(size: number): void {
    if (size < 0) {
      throw new Error("size < 0");
    }
    let nb = 1;
    while (overloaded(size, nb)) {
      nb = nb << 1;
    }
    if (nb < 2) {
      this.table = this.bucket0.slice(0, 1);
    } else {
      this.table = new Array(nb).fill(new Bucket());
    }
    this.tailLink = this.head;
  }

  public freeze(): void {
    if (!this.frozen) {
      this.frozen = true;

      for (let i = 0; i < this.table.length; i++) {
        let p: Bucket | null = this.table[i];
        while (p != null) {
          for (let j = 0; j <= p.entries.length; j++) {
            let e = p.entries[j];
            if (e && e.hash != 0) {
              e.key.Freeze();
              e.value.Freeze();
            }
          }
          p = p.next;
        }
      }
    }
  }

  insert(k: Value, v: Value): Error | null {
    let err = this.checkMutable("insert into");
    if (err != null) {
      return err;
    }
    if (this.table == null) {
      this.init(1);
    }

    let [h, err2] = k.Hash();
    if (err2) {
      return err2;
    }

    if (h === 0) {
      h = 1;
    }

    function insertImpl(this_: Hashtable) {
      let insert: Entry | null = null;
      let p = this_.table[h & (this_.table.length - 1)];
      while (true) {
        for (let i = 0; i < p.entries.length; i++) {
          const e = p.entries[i];
          if (e.hash !== h) {
            if (e.hash === 0) {
              insert = e;
            }
            continue;
          }
          let [eq, err] = Equal(k, e.key);
          if (err != null) {
            return err;
          } else if (!eq) {
            continue;
          }
          e.value = v;
          return null;
        }
        if (p.next == null) {
          break;
        }
        p = p.next;
      }

      if (overloaded(this_.len, this_.table.length)) {
        this_.grow();
        // @ts-ignore
        insertImpl(this_);
      }
      if (insert == null) {
        const b = new Bucket();
        p.next = b;
        insert = b.entries[0];
      }
      insert.hash = h;
      insert.key = k;
      insert.value = v;

      insert.prevLink = this_.tailLink;
      this_.tailLink = insert;
      this_.tailLink = insert.next;

      this_.len++;
      // console.log("*********************", this_);
      return null;
    }
    console.log("START DEBUG HashTable ===============");
    console.log(this);
    // @ts-ignore
    insertImpl(this);
    console.log(this);
    console.log("END DEBUG HashTable ===============");
    return null;
  }

  // Double the number of buckets and rehash.
  // TODO(adonovan): opt:
  // - avoid reentrant calls to ht.insert, and specialize it.
  // e.g. we know the calls to Equals will return false since
  // there are no duplicates among the old keys.
  // - saving the entire hash in the bucket would avoid the need to
  // recompute the hash.
  // - save the old buckets on a free list.
  grow() {
    this.table = new Array<Bucket>(this.table.length << 1);
    let oldhead = this.head;
    this.head = null;
    this.tailLink = this.head;
    this.len = 0;
    for (let e = oldhead; e != null; e = e.next) {
      this.insert(e.key, e.value);
    }
    this.bucket0[0] = new Bucket(); // clear out unused initial bucket
  }

  lookup(k: Value): [v: Value | null, found: boolean, err: Error | null] {
    let [h, err] = k.Hash();
    if (err != null) {
      return [null, false, err]; // unhashable
    }

    if (h === 0) {
      h = 1; // zero is reserved
    }

    if (this.table === null) {
      return [None, false, null]; // empty
    }

    // Inspect each bucket in the bucket list.
    let p: Bucket | null = this.table[h & (this.table.length - 1)];
    while (p !== null) {
      for (let i = 0; i < p.entries.length; i++) {
        const e: Entry = p.entries[i];
        if (e.hash === h) {
          let [eq, err] = Equal(k, e.key);
          if (err != null) {
            return [null, false, err]; // e.g. excessively recursive tuple
          }
          if (eq) {
            return [e.value, true, null]; // found
          }
        }
      }
      p = p.next;
    }
    return [None, false, null]; // not found
  }

  // Items returns all the items in the map (as key/value pairs) in insertion order.
  items(): Tuple[] {
    const items: Tuple[] = new Array();
    const array: Value[] = new Array(this.len * 2); // allocate a single backing array
    for (let e = this.head; e !== null; e = e.next) {
      const pair: Tuple = new Tuple([array[0], array[1]]);
      array.shift(); // remove the first element
      array.shift(); // remove the second element
      pair.elems[0] = e.key;
      pair.elems[1] = e.value;
      items.push(pair);
    }
    return items;
  }

  first(): [Value, boolean] {
    if (this.head !== null) {
      return [this.head.key, true];
    }
    return [None, false];
  }

  keys(): Value[] {
    const keys: Value[] = [];
    for (let e = this.head; e !== null; e = e.next) {
      keys.push(e.key);
    }
    return keys;
  }

  delete(k: Value): [Value | null, boolean, Error | null] {
    let err: Error | null;

    err = this.checkMutable("delete from");
    if (err) {
      return [null, false, err];
    }
    if (this.table == null) {
      return [None, false, null]; // empty
    }

    let h: number;
    [h, err] = k.Hash();

    if (err) {
      return [null, false, err]; // unhashable
    }

    if (h === 0) {
      h = 1; // zero is reserved
    }

    // Inspect each bucket in the bucket list.
    let p = this.table[h & (this.table.length - 1)];

    for (let i = 0; i < p.entries.length; i++) {
      const e = p.entries[i];
      if (e.hash === h) {
        let eq;
        [eq, err] = Equal(k, e.key);
        if (err) {
          return [null, false, err];
        }

        if (eq) {
          // Remove e from doubly-linked list.
          e.prevLink = e.next;
          if (e.next == null) {
            this.tailLink = e.prevLink; // deletion of last entry
          } else {
            e.next.prevLink = e.prevLink;
          }

          const v = e.value;
          // BUG:?
          delete p.entries[i];
          this.len--;
          return [v, true, null]; // found
        }
      }
    }

    // TODO: opt: remove completely empty bucket from bucket list.
    return [None, false, null]; // not found
  }

  // checkMutable reports an error if the hash table should not be mutated.
  // verb+" dict" should describe the operation.
  checkMutable(verb: string): Error | null {
    if (this.frozen) {
      return new Error(`cannot ${verb} frozen hash table`);
    }
    if (this.itercount > 0) {
      return new Error(`cannot ${verb} hash table during iteration`);
    }
    return null;
  }

  // clear removes all elements from the hash table.
  clear(): Error | null {
    if (this.checkMutable("clear") !== null) {
      return new Error(this.checkMutable("clear")?.message);
    }
    if (this.table !== null) {
      for (let i = 0; i < this.table.length; i++) {
        this.table[i] = new Bucket();
      }
    }
    this.head = null;
    this.tailLink = this.head;
    this.len = 0;

    return null;
  }

  addAll(other: Hashtable): Error | null {
    let e = other.head;
    while (e != null) {
      let err = this.insert(e.key, e.value);
      if (err) {
        return err;
      }
      e = e.next;
    }
    return null;
  }

  // TODO:
  // // dump is provided as an aid to debugging.
  // dump() {
  //   console.log(
  //     `hashtable ${this} len=${this.len} head=${this.head} tailLink=${this.tailLink}`
  //   );
  //   if (this.tailLink !== null) {
  //     console.log(` *tailLink=${this.tailLink}`);
  //   }
  //   console.log();
  //   for (let j = 0; j < this.table.length; j++) {
  //     console.log(`bucket chain ${j}`);
  //     let p = this.table[j];
  //     while (p != null) {
  //       console.log(`bucket ${p}`);
  //       for (let i = 0; i < p.entries.length; i++) {
  //         let e = p.entries[i];
  //         console.log(
  //           `\tentry ${i} @ ${e} hash=${e.hash} key=${e.key} value=${e.value}`
  //         );
  //         console.log(`\t\tnext=${e.next} &next=${e.next} prev=${e.prevLink}`);
  //         if (e.prevLink !== null) {
  //           console.log(` *prev=${e.prevLink}`);
  //         }
  //         console.log();
  //       }
  //       p = p.next;
  //     }
  //   }
  // }

  iterate(): keyIterator {
    if (!this.frozen) {
      this.itercount++;
    }

    return new keyIterator(this, this.head!);
  }
}

class keyIterator {
  private ht: Hashtable;
  private e: Entry | null;

  constructor(ht: Hashtable, e: Entry) {
    this.ht = ht;
    this.e = e;
  }

  public next(k: Value): boolean {
    if (this.e != null) {
      // BUG::
      k = this.e.key;
      this.e = this.e.next;
      return true;
    }
    return false;
  }

  public done(): void {
    if (!this.ht.frozen) {
      this.ht.itercount--;
    }
  }
}

// TODO(adonovan): use go1.19's maphash.String.
// hashString computes the hash of s.
export function hashString(s: string): number {
  // TODO:
  // if len(s) >= 12 {
  //   // Call the Go runtime's optimized hash implementation,
  //   // which uses the AESENC instruction on amd64 machines.
  //   return uint32(goStringHash(s, 0))
  // }
  return softHashString(s);
}

// softHashString computes the 32-bit FNV-1a hash of s in software.
function softHashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= parseInt(s[i]);
    h *= 16777619;
  }
  return h;
}
