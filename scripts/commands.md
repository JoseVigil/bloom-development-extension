projects generate_project_context.py 

python /c/repos/bloom-videos/bloom-development-extension/scripts/projects/generate_project_context.py --strategy=android --root=/c/TEMP/tmp/dummy

--hash /c/repos/bloom-videos/bloom-development-extension/tree/hash\_tree.txt /c/repos/bloom-videos/bloom-development-extension/src /c/repos/bloom-videos/bloom-development-extension/package.json /c/repos/bloom-videos/bloom-development-extension/tsconfig.json

tree\_hash.py

python generate_tree.py --hash hash_tree.txt src package.json tsconfig.json

python generate_tree.py --hash --json snapshot.txt src package.json tsconfig.json

python generate_tree.py simple_tree.txt src package.json

python generate_tree.py bridge_tree.txt src installer package.json


tree gzip json

python /c/repos/bloom-videos/bloom-development-extension/scripts/gzip_json_compressor.py /c/repos/bloom-videos/bloom-development-extension/tree/hash\_tree.json /c/repos/bloom-videos/bloom-development-extension/tree/hash\_tree\_gzip.json

tree\_custom.py

python /c/repos/bloom-videos/bloom-development-extension/scripts/tree\_hash.py --hash /c/repos/bloom-videos/bloom-development-extension/tree/hash\_tree.txt /c/repos/bloom-videos/bloom-development-extension/src /c/repos/bloom-videos/bloom-development-extension/package.json /c/repos/bloom-videos/bloom-development-extension/tsconfig.json

codebase\_generation.py

codebase_key_files.ml

python /c/repos/bloom-videos/bloom-development-extension/scripts/codebase_generation.py --output /c/repos/bloom-videos/bloom-development-extension/codebase/codebase_key_files.bl --files /c/repos/bloom-videos/bloom-development-extension/package.json /c/repos/bloom-videos/bloom-development-extension/src/extension.ts /c/repos/bloom-videos/bloom-development-extension/src/initialization/commandRegistry.ts /c/repos/bloom-videos/bloom-development-extension/src/initialization/providersInitializer.ts /c/repos/bloom-videos/bloom-development-extension/src/initialization/managersInitializer.ts /c/repos/bloom-videos/bloom-development-extension/src/core/gitOrchestrator.ts /c/repos/bloom-videos/bloom-development-extension/src/core/nucleusManager.ts /c/repos/bloom-videos/bloom-development-extension/src/core/intentSession.ts /c/repos/bloom-videos/bloom-development-extension/src/managers/userManager.ts /c/repos/bloom-videos/bloom-development-extension/src/managers/workspaceManager.ts /c/repos/bloom-videos/bloom-development-extension/src/utils/gitManager.ts /c/repos/bloom-videos/bloom-development-extension/src/providers/nucleusTreeProvider.ts /c/repos/bloom-videos/bloom-development-extension/src/providers/intentTreeProvider.ts /c/repos/bloom-videos/bloom-development-extension/src/commands/manageProject.ts

Sample  codebase.ml

python /c/repos/bloom-videos/bloom-development-extension/scripts/codebase\_generation.py --output /c/repos/bloom-videos/bloom-development-extension/codebase/codebase.ml --files /c/repos/bloom-videos/bloom-development-extension/package.json /c/repos/bloom-videos/bloom-development-extension/src/extension.ts /c/repos/bloom-videos/bloom-development-extension/src/core/intentSession.ts /c/repos/bloom-videos/bloom-development-extension/src/core/intentAutoSaver.ts /c/repos/bloom-videos/bloom-development-extension/src/core/metadataManager.ts /c/repos/bloom-videos/bloom-development-extension/src/core/codebaseGenerator.ts /c/repos/bloom-videos/bloom-development-extension/src/commands/addToIntent.ts /c/repos/bloom-videos/bloom-development-extension/src/commands/deleteIntentFromForm.ts /c/repos/bloom-videos/bloom-development-extension/src/commands/openFileInVSCode.ts /c/repos/bloom-videos/bloom-development-extension/src/commands/revealInFinder.ts /c/repos/bloom-videos/bloom-development-extension/src/commands/generateIntent.ts /c/repos/bloom-videos/bloom-development-extension/src/commands/openIntent.ts /c/repos/bloom-videos/bloom-development-extension/src/providers/intentTreeProvider.ts /c/repos/bloom-videos/bloom-development-extension/src/models/intent.ts /c/repos/bloom-videos/bloom-development-extension/src/ui/intentFormPanel.ts /c/repos/bloom-videos/bloom-development-extension/src/ui/intentForm.html /c/repos/bloom-videos/bloom-development-extension/src/ui/intentForm.css /c/repos/bloom-videos/bloom-development-extension/src/ui/intentForm.js

codebase gzip

python /c/repos/bloom-videos/bloom-development-extension/scripts/gzip_compressor.py /c/repos/bloom-videos/bloom-development-extension/codebase/codebase_key_files.bl /c/repos/bloom-videos/bloom-development-extension/codebase/codebase_key_files_gzip.json

codebase

python /c/repos/bloom-videos/bloom-development-extension/scripts/gzip_compressor.py --no-gzip /c/repos/bloom-videos/bloom-development-extension/codebase/codebase_key_files.bl /c/repos/bloom-videos/bloom-development-extension/codebase/codebase_key_files.json



codebase\_snapshot\_integration.py

python /c/repos/bloom-videos/bloom-development-extension/scripts/codebase_snapshot_integration.py /c/repos/bloom-videos/bloom-development-extension/codebase/bloom-btip-workflow.md /c/repos/bloom-videos/bloom-development-extension --backup-dir /c/repos/bloom-videos/bloom-development-extension/backput/codebase_backput

snapshot_normalizer.py

python /c/repos/bloom-videos/bloom-development-extension/scripts/snapshot_normalizer.py /c/repos/bloom-videos/bloom-development-extension/codebase/bloom-btip-workflow.md /c/repos/bloom-videos/bloom-development-extension/codebase/snapshot.normalized.md