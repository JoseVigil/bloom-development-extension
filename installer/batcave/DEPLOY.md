# BATCAVE Deployment Instructions

## Prerequisites

- Python 3.7+
- Git installed
- Write access to target `.bloom` directory

## Deployment Command

```bash
python scripts/deploy_batcave.py --bloom-path <PATH> --organization <ORG_NAME>
```

## Parameters

| Parameter | Short | Required | Description |
|-----------|-------|----------|-------------|
| `--bloom-path` | `-b` | Yes | Absolute or relative path to `.bloom` directory |
| `--organization` | `-o` | Yes | Organization name (lowercase alphanumeric with hyphens) |

## Examples

### Local development
```bash
python scripts/deploy_batcave.py -b ~/.bloom -o acme-corp
```

### Shared workspace
```bash
python scripts/deploy_batcave.py -b /var/workspaces/.bloom -o startup-xyz
```

### Relative path
```bash
python scripts/deploy_batcave.py -b ../project/.bloom -o mycompany
```

## What Happens

1. ✅ Validates `.bloom` directory exists
2. ✅ Reads version from `scripts/VERSION`
3. ✅ Increments build number in `scripts/build_number.txt`
4. ✅ Creates `.bloom/.nucleus-{organization}/` if needed
5. ✅ Copies all `src/` contents to `.bloom/.nucleus-{organization}/.batcave/`
6. ✅ Generates `version.json` with version and build info
7. ✅ Generates `config/config.json` with organization config
8. ✅ Generates `README.md` for the organization
9. ✅ Initializes git repository in `.batcave/`

## Post-Deployment

After successful deployment, navigate to the production directory and initialize:

```bash
cd /path/to/.bloom/.nucleus-{organization}/.batcave
npm install
npm run build
npm start
```

Or with environment variable:

```bash
BLOOM_ORGANIZATION={organization} npm start
```

## Production Structure

```
.bloom/
└── .nucleus-{organization}/
    └── .batcave/
        ├── core/
        ├── dynamic/
        ├── config/
        │   └── config.json      # Generated
        ├── utils/
        ├── main.ts
        ├── package.json
        ├── tsconfig.json
        ├── .gitignore
        ├── version.json         # Generated
        └── README.md            # Generated
```

## Version Management

- **VERSION**: Edit `scripts/VERSION` to change version (e.g., `1.0.0` → `1.1.0`)
- **BUILD**: Automatically incremented each deployment (stored in `scripts/build_number.txt`)

## Troubleshooting

### Error: "Bloom directory not found"
- Ensure the path to `.bloom` is correct
- Create `.bloom` directory if it doesn't exist: `mkdir -p /path/to/.bloom`

### Error: "Source directory not found"
- Run the script from the repository root
- Ensure `src/` directory exists with source code

### Error: "Git initialization failed"
- Git is not installed or not in PATH
- The script will continue; you can manually initialize git later

## Notes

- Each deployment overwrites `.batcave/` completely (clean deploy)
- Build number increments automatically - no manual intervention needed
- Production `.batcave/` becomes a standalone git repository
- Deploy script never touches development repository's git history
