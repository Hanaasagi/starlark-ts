import { parse } from "../src/syntax/parse";

var assert = require("assert");

describe("parse real world cases", function() {
  const path = require("path");
  const fs = require("fs");

  const basedir = __dirname;
  const directoryPath = basedir + "/testcases/parse";
  let caseFiles = fs.readdirSync(directoryPath);

  for (var file of caseFiles) {
    if (path.extname(file) != ".star") {
      continue;
    }

    describe("parse " + file, function() {
      it("parse successfully", function() {
        let [_, err] = parse(directoryPath + "/" + file, null, 0);
        assert.equal(err, null);
      });
    });
  }
});
