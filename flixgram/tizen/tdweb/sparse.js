/* Flixgram (Samsung TV): TDLib in the browser keeps downloaded files in memory (MEMFS). A video that
 * is being streamed is written at whatever offset is playing, and MEMFS would allocate the whole file
 * up to that offset (1-2 GB on a TV). Big files under the download folder are stored here in 1 MB
 * blocks instead, so only the parts that were actually downloaded take memory. Small files (thumbnails,
 * photos) and the database are untouched. Prepended to tdweb's worker.js by patch.mjs. */
function flixSparse(FS) {
  var MEMFS = FS && FS.filesystems && FS.filesystems.MEMFS;
  if (!MEMFS || MEMFS.flixSparse) return;
  MEMFS.flixSparse = true;
  var BLOCK = 1 << 20;
  var LIMIT = 8 << 20;
  var S = MEMFS.stream_ops;
  var oRead = S.read, oWrite = S.write, oAlloc = S.allocate, oMmap = S.mmap;
  var oResize = MEMFS.resizeFileStorage, oData = MEMFS.getFileDataAsTypedArray;

  function inbound(node) {
    if (node.flixIn === undefined) {
      try { node.flixIn = FS.getPath(node).indexOf('/inboundfs/') >= 0; } catch (e) { node.flixIn = false; }
    }
    return node.flixIn;
  }
  function wants(node, end) {
    return !!node.sparse || (end > LIMIT && FS.isFile(node.mode) && inbound(node));
  }
  function toSparse(node) {
    if (node.sparse) return;
    var map = new Map();
    var c = node.contents, used = node.usedBytes || 0;
    if (c && used) {
      for (var p = 0; p < used; p += BLOCK) {
        var b = new Uint8Array(BLOCK);
        var end = Math.min(used, p + BLOCK);
        if (c.subarray) b.set(c.subarray(p, end));
        else for (var i = p; i < end; i++) b[i - p] = c[i];
        map.set(p / BLOCK, b);
      }
    }
    node.sparse = map;
    node.contents = null;
  }
  function assemble(node, from, to) {
    var out = new Uint8Array(Math.max(0, to - from));
    var pos = from;
    while (pos < to) {
      var bi = Math.floor(pos / BLOCK), off = pos - bi * BLOCK, n = Math.min(BLOCK - off, to - pos);
      var b = node.sparse.get(bi);
      if (b) out.set(b.subarray(off, off + n), pos - from);
      pos += n;
    }
    return out;
  }

  S.write = function (stream, buffer, offset, length, position, canOwn) {
    var node = stream.node;
    if (!length || !wants(node, position + length)) return oWrite.apply(this, arguments);
    toSparse(node);
    node.timestamp = Date.now();
    var done = 0;
    while (done < length) {
      var pos = position + done, bi = Math.floor(pos / BLOCK), off = pos - bi * BLOCK, n = Math.min(BLOCK - off, length - done);
      var b = node.sparse.get(bi);
      if (!b) { b = new Uint8Array(BLOCK); node.sparse.set(bi, b); }
      if (buffer.subarray) b.set(buffer.subarray(offset + done, offset + done + n), off);
      else for (var i = 0; i < n; i++) b[off + i] = buffer[offset + done + i];
      done += n;
    }
    node.usedBytes = Math.max(node.usedBytes || 0, position + length);
    return length;
  };

  S.read = function (stream, buffer, offset, length, position) {
    var node = stream.node;
    if (!node.sparse) return oRead.apply(this, arguments);
    if (position >= node.usedBytes) return 0;
    var size = Math.min(node.usedBytes - position, length);
    buffer.set(assemble(node, position, position + size), offset);
    return size;
  };

  S.allocate = function (stream, offset, length) {
    var node = stream.node;
    if (!wants(node, offset + length)) return oAlloc.apply(this, arguments);
    toSparse(node);
    node.usedBytes = Math.max(node.usedBytes || 0, offset + length);
  };

  S.mmap = function (stream) {
    var node = stream.node;
    if (!node.sparse) return oMmap.apply(this, arguments);
    var map = node.sparse;
    node.contents = assemble(node, 0, node.usedBytes);
    node.sparse = null;
    try { return oMmap.apply(this, arguments); } finally { node.contents = null; node.sparse = map; }
  };

  MEMFS.resizeFileStorage = function (node, newSize) {
    if (!wants(node, newSize)) return oResize.apply(this, arguments);
    toSparse(node);
    node.sparse.forEach(function (b, bi) {
      var start = bi * BLOCK;
      if (start >= newSize) node.sparse.delete(bi);
      else if (start + BLOCK > newSize) b.fill(0, newSize - start);
    });
    node.usedBytes = newSize;
  };

  MEMFS.getFileDataAsTypedArray = function (node) {
    if (!node.sparse) return oData.apply(this, arguments);
    return assemble(node, 0, node.usedBytes);
  };
}
