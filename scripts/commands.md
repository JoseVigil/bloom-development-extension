projects generate_project_context.py 

python /c/repos/bloom-videos/bloom-development-extension/scripts/projects/generate_project_context.py --strategy=android --root=/c/TEMP/tmp/dummy

--hash /c/repos/bloom-videos/bloom-development-extension/tree/hash\_tree.txt /c/repos/bloom-videos/bloom-development-extension/src /c/repos/bloom-videos/bloom-development-extension/package.json /c/repos/bloom-videos/bloom-development-extension/tsconfig.json

tree\_hash.py

python generate_tree.py --hash hash_tree.txt src package.json tsconfig.json

python generate_tree.py --hash --json snapshot.txt src package.json tsconfig.json

python generate_tree.py src_tree.txt src package.json tsconfig.json

python generate_tree.py bridge_tree.txt src installer package.json


tree gzip json

python /c/repos/bloom-videos/bloom-development-extension/scripts/gzip_json_compressor.py /c/repos/bloom-videos/bloom-development-extension/tree/hash\_tree.json /c/repos/bloom-videos/bloom-development-extension/tree/hash\_tree\_gzip.json

tree\_custom.py

python /c/repos/bloom-videos/bloom-development-extension/scripts/tree\_hash.py --hash /c/repos/bloom-videos/bloom-development-extension/tree/hash\_tree.txt /c/repos/bloom-videos/bloom-development-extension/src /c/repos/bloom-videos/bloom-development-extension/package.json /c/repos/bloom-videos/bloom-development-extension/tsconfig.json

CODEBASE 

python files_compressor.py --mode codebase --input ../../src ../../webview --output ../../codebase/

python files_compressor.py --mode docbase --input ../../docs/v9 --output ../../codebase/

python file_extractor.py --input ../../codebase/.codebase.json --output ../../extracted_code/

python file_extractor.py --input ../../codebase/.codebase.json --output /c/TEMP/TMP


PACK

pack_intent_dev_briefing.py

python pack_intent_dev_briefing.py .example-dev /c/TEMP/TMP

pack_intent_dev_execution.py

python pack_intent_dev_execution.py .example-dev /c/TEMP/TMP

pack_intent_dev_refinement.py

python pack_intent_dev_refinement.py .example-dev 1 /c/TEMP/TMP
