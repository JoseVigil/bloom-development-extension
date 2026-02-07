# BATCAVE - Development Repository

Development repository for BATCAVE, a dynamic multi-tenant sovereign control plane for GitHub Codespaces.

## Repository Structure

- `src/` - Source code (deploys to production)
- `scripts/` - Deployment and build tools (development only)
- `config/` - Deployment system configuration (development only)

## Development Workflow

1. Make changes in `src/`
2. Test locally if needed
3. Deploy to production when ready

## Deployment

Deploy BATCAVE to a `.bloom/.nucleus-{organization}/.batcave/` structure:

```bash
python scripts/deploy_batcave.py --bloom-path /path/to/.bloom --organization org-name
```

### Parameters

- `--bloom-path` / `-b`: Path to the `.bloom` directory
- `--organization` / `-o`: Organization name (creates `.nucleus-{organization}/`)

### Examples

```bash
# Deploy to local bloom
python scripts/deploy_batcave.py -b ~/.bloom -o acme-corp

# Deploy to shared workspace
python scripts/deploy_batcave.py -b /var/workspaces/.bloom -o startup-xyz
```

## Versioning

- **Version**: Defined in `scripts/VERSION`
- **Build Number**: Auto-incremented in `scripts/build_number.txt`

Each deployment:
- Reads current version from `scripts/VERSION`
- Increments build number in `scripts/build_number.txt`
- Generates `version.json` in production with both values

## What Gets Deployed

### From Development → Production

✅ **Deployed** (contents of `src/`):
- All source code
- Configuration templates
- package.json, tsconfig.json
- .gitignore

❌ **NOT Deployed**:
- `scripts/` directory
- `config/deploy_config.json`
- Development documentation
- `.git/` directory

### Generated in Production

The deployment script creates these files in `.batcave/`:

- `version.json` - Version and build information
- `config/config.json` - Organization-specific configuration
- `README.md` - Organization-specific readme

## Production Structure

After deployment, the production structure will be:

```
.bloom/
└── .nucleus-{organization}/
    └── .batcave/
        ├── core/
        ├── dynamic/
        ├── config/
        ├── utils/
        ├── main.ts
        ├── package.json
        ├── tsconfig.json
        ├── version.json         (generated)
        ├── config/config.json   (generated)
        └── README.md            (generated)
```

## Architecture

See `BATCAVE_DYNAMIC_ARCHITECTURE.md` for complete architecture documentation.

## Contributing

All changes must be made in `src/`. Never edit files directly in `.batcave/` production deployments.
