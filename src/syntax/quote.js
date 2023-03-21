// Starlark quoted string utilities.
// unesc maps single-letter chars following \ to their actual values.
var unesc = {
    a: "\x07",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
    "\\": "\\",
    "'": "'",
    '"': '"'
};
// esc maps escape-worthy bytes to the char that should follow \.
var esc = {
    "\x07": "a",
    "\b": "b",
    "\f": "f",
    "\n": "n",
    "\r": "r",
    "\t": "t",
    "\v": "v",
    "\\": "\\",
    "'": "'",
    '"': '"'
};
function unquote(quoted) {
    var s = "";
    var triple = false;
    var isByte = false;
    var err;
    // Check for raw prefix: means don't interpret the inner \.
    var raw = false;
    if (quoted.startsWith("r")) {
        raw = true;
        quoted = quoted.slice(1);
    }
    // Check for bytes prefix.
    if (quoted.startsWith("b")) {
        isByte = true;
        quoted = quoted.slice(1);
    }
    if (quoted.length < 2) {
        err = new Error("string literal too short");
        return [s, triple, isByte, err];
    }
    if ((quoted[0] !== '"' && quoted[0] !== "'") ||
        quoted[0] !== quoted[quoted.length - 1]) {
        err = new Error("string literal has invalid quotes");
        return [s, triple, isByte, err];
    }
    // Check for triple quoted string.
    var quote = quoted[0];
    if (quoted.length >= 6 &&
        quoted[1] === quote &&
        quoted[2] === quote &&
        quoted.slice(0, 3) === quoted.slice(quoted.length - 3)) {
        triple = true;
        quoted = quoted.slice(3, quoted.length - 3);
    }
    else {
        quoted = quoted.slice(1, quoted.length - 1);
    }
    // Now quoted is the quoted data, but no quotes.
    // If we're in raw mode or there are no escapes or
    // carriage returns, we're done.
    var unquoteChars;
    if (raw) {
        unquoteChars = "\r";
    }
    else {
        unquoteChars = "\\\r";
    }
    if (!quoted.includes(unquoteChars)) {
        s = quoted;
        return [s, triple, isByte, err];
    }
    // Otherwise process quoted string.
    // Each iteration processes one escape sequence along with the
    // plain text leading up to it.
    var buf = new Array();
    while (quoted.length > 0) {
        // Remove prefix before escape sequence.
        var i = quoted.indexOfAny(unquoteChars);
        if (i < 0) {
            i = quoted.length;
        }
        buf.push.apply(buf, quoted.slice(0, i).split("").map(function (c) { return c.charCodeAt(0); }));
        quoted = quoted.slice(i);
        if (quoted.length === 0) {
            break;
        }
        // Process carriage return.
        if (quoted[0] === "\r") {
            buf.push("\n".charCodeAt(0));
            if (quoted.length > 1 && quoted[1] === "\n") {
                quoted = quoted.slice(2);
            }
            else {
                quoted = quoted.slice(1);
            }
            continue;
        }
        // Process escape sequence.
        if (quoted.length === 1) {
            err = new Error("truncated escape sequence \\");
            return [s, triple, isByte, err];
        }
        switch (quoted[1]) {
            default:
                // In Starlark, like Go, a backslash must escape something.
                // (Python still treats unnecessary backslashes literally,
                // but since 3.6 has emitted a deprecation warning.)
                err = new Error("invalid escape sequence \\".concat(quoted[1]));
                return;
            case '\n':
                // Ignore the escape and the line break.
                quoted = quoted.slice(2);
                break;
            case 'a':
            case 'b':
            case 'f':
            case 'n':
            case 'r':
            case 't':
            case 'v':
            case '\\':
            case '\'':
            case '"':
                // One-char escape.
                // Escapes are allowed for both kinds of quotation
                // mark, not just the kind in use.
                buf.push(unesc[quoted[1]]);
                quoted = quoted.slice(2);
                break;
            case '0':
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
                // Octal escape, up to 3 digits, \OOO.
                var n = quoted[1].charCodeAt(0) - '0'.charCodeAt(0);
                quoted = quoted.slice(2);
                for (var i_1 = 1; i_1 < 3; i_1++) {
                    if (quoted.length == 0 || quoted[0] < '0' || '7' < quoted[0]) {
                        break;
                    }
                    n = n * 8 + quoted[0].charCodeAt(0) - '0'.charCodeAt(0);
                    quoted = quoted.slice(1);
                }
                if (!isByte && n > 127) {
                    err = new Error("non-ASCII octal escape \\".concat(n, " (use \\u").concat(n.toString(16).padStart(4, '0'), " for the UTF-8 encoding of U+").concat(n.toString(16).padStart(4, '0'), ")"));
                    return;
                }
                if (n >= 256) {
                    // NOTE: Python silently discards the high bit,
                    // so that '\541' == '\141' == 'a'.
                    // Let's see if we can avoid doing that in BUILD files.
                    err = new Error("invalid escape sequence \\".concat(n.toString(8).padStart(3, '0')));
                    return;
                }
                buf.push(n);
                break;
            case 'x':
                // Hexadecimal escape, exactly 2 digits, \xXX. [0-127]
                if (quoted.length < 4) {
                    err = new Error("truncated escape sequence ".concat(quoted));
                    return;
                }
                var n = parseInt(quoted.slice(2, 4), 16);
                if (!isByte && n > 127) {
                    err = new Error("non-ASCII hex escape ".concat(quoted.slice(0, 4), " (use \\u").concat(n.toString(16).padStart(4, '0'), " for the UTF-8 encoding of U+").concat(n.toString(16).padStart(4, '0'), ")"));
                    return;
                }
                buf.push(n);
                quoted = quoted.slice(4);
                break;
            case 'u':
            case 'U':
                // Unicode code point, 4 (\uXXXX) or 8 (\UXXXXXXXX) hex digits.
                var sz = 6;
                if (quoted[1] == 'U') {
                    sz = 10;
                }
        }
    }
}
