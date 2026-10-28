BSDIFF40 tools for Expo OTA bundle patches.

bsdiff.c: FreeBSD releng/10.0 usr.bin/bsdiff/bsdiff/bsdiff.c, retrieved 2026-10-28.
https://github.com/freebsd/freebsd-src/blob/releng/10.0/usr.bin/bsdiff/bsdiff/bsdiff.c
Only the FreeBSD-specific identification macro was removed for portability.

bspatch.c: Expo SDK 57 expo-updates/vendor/bspatch/bspatch.c, including its bounds checks.
https://github.com/expo/expo/tree/main/packages/expo-updates/vendor/bspatch
Compile with -Dbspatch_main=main for the server command.

Both files retain their BSD license notices.
