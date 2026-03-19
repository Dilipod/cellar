const { existsSync } = require("fs");
const { join } = require("path");

// napi-rs convention: <name>.<platform>-<arch>.node
const localPath = join(__dirname, "cel-napi.darwin-arm64.node");
if (existsSync(localPath)) {
  module.exports = require(localPath);
} else {
  throw new Error(
    `CEL native module not found at ${localPath}. Run: cargo build --release -p cel-napi`
  );
}
