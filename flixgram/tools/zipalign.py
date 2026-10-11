#!/usr/bin/env python3
"""zipalign replacement: rewrites a zip so every STORED entry starts on a 4-byte boundary
(resources.arsc must be uncompressed and aligned for targetSdk >= 30)."""
import struct, sys, zipfile, zlib

def main(src, dst):
    zin = zipfile.ZipFile(src)
    out = open(dst, 'wb')
    central = []
    for info in zin.infolist():
        data = zin.read(info.filename)
        name = info.filename.encode('utf-8')
        store = info.filename == 'resources.arsc' or info.compress_type == zipfile.ZIP_STORED
        if store:
            payload, method = data, 0
        else:
            c = zlib.compressobj(9, zlib.DEFLATED, -15)
            payload, method = c.compress(data) + c.flush(), 8
        crc = zlib.crc32(data) & 0xffffffff
        off = out.tell()
        extra = b''
        if method == 0:
            pad = (-(off + 30 + len(name) + 6)) % 4
            extra = struct.pack('<HHH', 0xD935, 2 + pad, 4) + b'\0' * pad
        out.write(struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, 0x0800, method, 0, 0x5C21, crc, len(payload), len(data), len(name), len(extra)) + name + extra + payload)
        central.append((name, method, crc, len(payload), len(data), off))
    cd = out.tell()
    for name, method, crc, cs, us, off in central:
        out.write(struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 20, 20, 0x0800, method, 0, 0x5C21, crc, cs, us, len(name), 0, 0, 0, 0, 0, off) + name)
    size = out.tell() - cd
    out.write(struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, len(central), len(central), size, cd, 0))
    out.close()

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
