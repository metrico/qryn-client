// ProtobufHandler.js
const protobuf = require('protobufjs');
const path = require('path');
const snappy = require('snappy');

class ProtobufHandler {
  constructor() {
    this.protoRoot = protobuf.loadSync(path.resolve(__dirname, './remote.proto'));
    this.WriteRequest = this.protoRoot.lookupType('WriteRequest');
  }

  encodeWriteRequest(timeseries) {
    const writeRequest = this.WriteRequest.create(timeseries);
    return this.WriteRequest.encode(writeRequest).finish();
  }

  async compressBuffer(buffer) {
    return await snappy.compress(buffer);
  }
}

module.exports = ProtobufHandler;