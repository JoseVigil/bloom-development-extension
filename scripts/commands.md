tree\_custom.py



python /c/repos/bloom-videos/bloom-development-extension/scripts/tree\_custom.py /c/repos/bloom-videos/bloom-development-extension/tree/plugin\_tree.txt /c/repos/bloom-videos/bloom-development-extension/src   /c/repos/bloom-videos/bloom-development-extension/package.json /c/repos/bloom-videos/bloom-development-extension/tsconfig.json

codebase\_generation.py

python /c/repos/bloom-videos/bloom-development-extension/scripts/codebase\_generation.py --output /c/repos/bloom-videos/bloom-development-extension/codebase/codebase.ml --files /c/repos/bloom-videos/bloom-development-extension/package.json /c/repos/bloom-videos/bloom-development-extension/src/extension.ts /c/repos/bloom-videos/bloom-development-extension/src/core/intentSession.ts /c/repos/bloom-videos/bloom-development-extension/src/core/intentAutoSaver.ts /c/repos/bloom-videos/bloom-development-extension/src/core/metadataManager.ts /c/repos/bloom-videos/bloom-development-extension/src/core/codebaseGenerator.ts /c/repos/bloom-videos/bloom-development-extension/src/commands/addToIntent.ts /c/repos/bloom-videos/bloom-development-extension/src/commands/deleteIntentFromForm.ts /c/repos/bloom-videos/bloom-development-extension/src/commands/openFileInVSCode.ts /c/repos/bloom-videos/bloom-development-extension/src/commands/revealInFinder.ts /c/repos/bloom-videos/bloom-development-extension/src/commands/generateIntent.ts /c/repos/bloom-videos/bloom-development-extension/src/commands/openIntent.ts /c/repos/bloom-videos/bloom-development-extension/src/providers/intentTreeProvider.ts /c/repos/bloom-videos/bloom-development-extension/src/models/intent.ts /c/repos/bloom-videos/bloom-development-extension/src/ui/intentFormPanel.ts /c/repos/bloom-videos/bloom-development-extension/src/ui/intentForm.html /c/repos/bloom-videos/bloom-development-extension/src/ui/intentForm.css /c/repos/bloom-videos/bloom-development-extension/src/ui/intentForm.js





codebase\_snapshot\_integration.py



python /c/repos/bloom-videos/bloom-development-extension/scripts/codebase\_snapshot\_integration.py /c/repos/bloom-videos/bloom-development-extension/codebase/codebase\_snapshot.md /c/repos/bloom-videos/bloom-development-extension --tree /c/repos/bloom-videos/bloom-development-extension/tree/plugin\_tree.txt --backup-dir /c/repos/bloom-videos/bloom-development-extension/backput/codebase\_backput

