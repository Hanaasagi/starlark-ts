# starlark-ts

### Build and Install

```
# Need TypeScript and node.js environment

$ git clone https://github.com/Hanaasagi/starlark-ts
$ npm install
$ make build
$ npm run start  # Enter the REPL, or `npm run start [filepath]` to run script
```

The code provides an example of the syntax of Starlark:

```python
# Define a number
number = 18

def fizz_buzz(n):
    """Print Fizz Buzz numbers from 1 to n."""
    for i in range(1, n + 1):
        s = ""
        if i % 3 == 0:
            s += "Fizz"
        if i % 5 == 0:
            s += "Buzz"
        print(s if s else i)

fizz_buzz(number)
```

### TODOs

- [ ] Implement the language specification
  - [ ] Builtin Types
    - [x] bool
    - [x] int (JavaScript BigInt)
    - [x] float (JavaScript Number)
    - [x] string
    - [ ] bytes
    - [x] list
    - [x] tuple
    - [x] dict
    - [x] set
  - [x] Control flow
    - [x] if/else
    - [x] for/range
    - [x] while
    - [x] break/continue
  - [x] operator
    - [x] `+`
    - [x] `-`
    - [x] `*`
    - [x] `/`
    - [x] `//`
    - [x] `%`
    - [x] `>`, `>=`, `==` ... comparison operator
    - [x] `and`
    - [x] `or`
    - [ ] `in`
    - [ ] `not in`
    - [ ] `|`
    - [ ] `^`
    - [ ] `&`
  - [ ] Function
    - [x] Positional arguments
    - [x] Keyword arguments
    - [ ] Variable length arguments
    - [x] return
  - [ ] Module
    - [ ] load

Reference [Starlark Spec](https://github.com/bazelbuild/starlark/blob/master/spec.md)

### License

Starlark-ts is Apache License, version 2.0 licensed, as found in the LICENSE file.
