# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path


AITAP_ROOT = Path(SPECPATH)
SRC_ROOT = AITAP_ROOT / "src"

datas = [
    (str(AITAP_ROOT / "contracts"), "contracts"),
    (str(AITAP_ROOT / "policies"), "policies"),
    (str(AITAP_ROOT / "registry"), "registry"),
    (str(AITAP_ROOT / "VERSION"), "."),
]

a = Analysis(
    [str(SRC_ROOT / "aitap" / "__main__.py")],
    pathex=[str(SRC_ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="aitap",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="aitap",
)
