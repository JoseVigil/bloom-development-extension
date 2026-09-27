"""Lectura del sistema operativo minimo declarado por un binario Mach-O.

Solo lectura y sin procesos externos (no usa otool ni vtool). Soporta binarios
thin de 64 bits y universales (fat). Devuelve el ``minos`` de
``LC_BUILD_VERSION`` o, en binarios antiguos, de ``LC_VERSION_MIN_MACOSX``.
"""
from __future__ import annotations

import struct
from pathlib import Path

MH_MAGIC_64 = 0xFEEDFACF
FAT_MAGIC = 0xCAFEBABE
FAT_MAGIC_64 = 0xCAFEBABF
LC_BUILD_VERSION = 0x32
LC_VERSION_MIN_MACOSX = 0x24
CPU_TYPE_X86_64 = 0x01000007
CPU_TYPE_ARM64 = 0x0100000C
ARCH_BY_CPUTYPE = {CPU_TYPE_X86_64: "x86_64", CPU_TYPE_ARM64: "arm64"}
MAX_HEADER_BYTES = 1 << 20


def _format_version(encoded: int) -> str:
    major, minor, patch = encoded >> 16, (encoded >> 8) & 0xFF, encoded & 0xFF
    return f"{major}.{minor}" + (f".{patch}" if patch else "")


def _thin_minos(data: bytes, offset: int) -> tuple[str | None, str | None]:
    if len(data) < offset + 32:
        return None, None
    magic, cputype, _sub, _ft, ncmds, sizeofcmds, _flags, _res = struct.unpack_from("<IiiIIIII", data, offset)
    if magic != MH_MAGIC_64:
        return None, None
    arch = ARCH_BY_CPUTYPE.get(cputype & 0xFFFFFFFF)
    cursor, end = offset + 32, offset + 32 + sizeofcmds
    for _ in range(ncmds):
        if cursor + 8 > min(end, len(data)):
            break
        cmd, cmdsize = struct.unpack_from("<II", data, cursor)
        if cmdsize < 8:
            break
        if cmd == LC_BUILD_VERSION and cursor + 16 <= len(data):
            _platform, minos = struct.unpack_from("<II", data, cursor + 8)
            return arch, _format_version(minos)
        if cmd == LC_VERSION_MIN_MACOSX and cursor + 12 <= len(data):
            (minos,) = struct.unpack_from("<I", data, cursor + 8)
            return arch, _format_version(minos)
        cursor += cmdsize
    return arch, None


def parse_minos(data: bytes) -> dict[str, str | None]:
    """Mapa arquitectura -> minos para un buffer que empieza en el header."""
    if len(data) < 8:
        return {}
    (magic_be,) = struct.unpack_from(">I", data, 0)
    if magic_be in (FAT_MAGIC, FAT_MAGIC_64):
        (count,) = struct.unpack_from(">I", data, 4)
        result: dict[str, str | None] = {}
        entry_size = 20 if magic_be == FAT_MAGIC else 32
        for index in range(min(count, 16)):
            base = 8 + index * entry_size
            if base + entry_size > len(data):
                break
            if magic_be == FAT_MAGIC:
                cputype, _sub, slice_offset, _size, _align = struct.unpack_from(">iiIII", data, base)
            else:
                cputype, _sub, slice_offset, _size, _align, _res = struct.unpack_from(">iiQQII", data, base)
            arch, minos = _thin_minos(data, slice_offset)
            result[arch or ARCH_BY_CPUTYPE.get(cputype & 0xFFFFFFFF, f"cpu-{cputype & 0xFFFFFFFF:#x}")] = minos
        return result
    arch, minos = _thin_minos(data, 0)
    return {arch: minos} if arch else {}


def read_minos(path: Path) -> dict[str, str | None]:
    """Lee solo los headers necesarios; un binario universal requiere leer cada slice."""
    try:
        with Path(path).open("rb") as stream:
            head = stream.read(4096)
            if len(head) < 8:
                return {}
            (magic_be,) = struct.unpack_from(">I", head, 0)
            if magic_be not in (FAT_MAGIC, FAT_MAGIC_64):
                return parse_minos(head + stream.read(MAX_HEADER_BYTES - len(head)))
            result: dict[str, str | None] = {}
            (count,) = struct.unpack_from(">I", head, 4)
            entry_size = 20 if magic_be == FAT_MAGIC else 32
            for index in range(min(count, 16)):
                base = 8 + index * entry_size
                if base + entry_size > len(head):
                    break
                if magic_be == FAT_MAGIC:
                    cputype, _sub, slice_offset, _size, _align = struct.unpack_from(">iiIII", head, base)
                else:
                    cputype, _sub, slice_offset, _size, _align, _res = struct.unpack_from(">iiQQII", head, base)
                stream.seek(slice_offset)
                arch, minos = _thin_minos(stream.read(MAX_HEADER_BYTES), 0)
                result[arch or ARCH_BY_CPUTYPE.get(cputype & 0xFFFFFFFF, "unknown")] = minos
            return result
    except OSError:
        return {}
