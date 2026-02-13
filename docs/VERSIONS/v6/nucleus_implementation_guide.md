# Bloom Nucleus - Implementation Guide

## 📋 Overview

This guide explains how to integrate **Bloom Nucleus** functionality into the existing Bloom BTIP VS Code plugin. Nucleus introduces organizational-level projects that document and link technical projects.

---

## 🎯 Key Concepts

### Nucleus Project (Parent)
- **Purpose**: Organizational knowledge center
- **Strategy**: `nucleus`
- **Identifier**: `.bloom/core/nucleus-config.json`
- **Content**: Documentation, policies, project overviews
- **Naming**: `nucleus-{organization}` (e.g., `nucleus-josevigil`)

### BTIP Project (Child)
- **Purpose**: Technical code project
- **Strategy**: `android`, `ios`, `node`, etc.
- **Identifier**: `.bloom/project/` directory
- **Content**: Code, intents, technical context
- **Link**: `.bloom/nucleus.json` (optional)

---

## 📁 Files to Create/Modify

### 1. New Files

#### `src/models/bloomConfig.ts` (EXTEND)
Add the following interfaces and types:
- `ProjectStrategy` - Add `'nucleus'` option
- `ProjectType` - New type for `'nucleus' | 'btip'`
- `NucleusConfig` - Main nucleus configuration
- `NucleusOrganization` - Organization metadata
- `NucleusInfo` - Nucleus project info
- `LinkedProject` - Linked BTIP projects
- `NucleusLink` - Link from child to parent
- Factory functions: `createNucleusConfig`, `createLinkedProject`, `createNucleusLink`
- Helper functions: `detectProjectType`, `isNucleusProject`, `loadNucleusConfig`, etc.

**Implementation**: See artifact `nucleus_models`

#### `src/strategies/NucleusStrategy.ts` (NEW)
Create strategy for handling Nucleus projects:
- Implements `CodebaseStrategy` interface
- Generates organizational documentation instead of code
- Reads `.bloom/organization/`, `.bloom/projects/` content
- Creates markdown-formatted codebase from docs

**Implementation**: See artifact `nucleus_strategy`

#### `src/commands/createNucleusProject.ts` (NEW)
Command to create a new Nucleus project:
- Prompts for organization name, URL, repository
- Creates directory structure
- Generates all `.bl` files with templates
- Creates `nucleus-config.json`

**Implementation**: See artifact `nucleus_commands`

#### `src/commands/linkToNucleus.ts` (NEW)
Command to link BTIP project to Nucleus:
- Detects current project strategy
- Searches for nearby Nucleus projects
- Creates `LinkedProject` entry in Nucleus
- Creates `nucleus.json` in BTIP project
- Generates project overview in Nucleus
- Updates projects index

**Implementation**: See artifact `link_to_nucleus`

#### `src/providers/nucleusTreeProvider.ts` (NEW)
Tree view provider for visualizing Nucleus structure:
- Shows organization hierarchy
- Groups projects by category (Mobile, Backend, Web, Other)
- Displays project status badges
- Enables quick project navigation

**Implementation**: See artifact `nucleus_tree_provider`

### 2. Modified Files

#### `src/strategies/ProjectDetector.ts` (UPDATE)
Add Nucleus detection as PRIORITY 1:
- Check for `nucleus-config.json` before other strategies
- Add `isNucleusProject()` method
- Add `hasNucleusLink()` method
- Add `findParentNucleus()` method
- Add `getProjectInfo()` for complete project metadata

**Implementation**: See artifact `updated_project_detector`

#### `package.json` (UPDATE)
Register new commands and views:
- Add `bloom.createNucleusProject` command
- Add `bloom.linkToNucleus` command
- Add `bloom.unlinkFromNucleus` command
- Add `bloom.openNucleusProject` command
- Add `bloom.syncNucleusProjects` command
- Add `bloomNucleus` view in activity bar
- Add keybinding `Ctrl+Alt+N` / `Cmd+Alt+N` for creating Nucleus
- Add `bloom.nucleusAutoDetect` configuration option

**Implementation**: See artifact `updated_package_json`

#### `src/extension.ts` (UPDATE)
Register new providers and commands:

```typescript
import { NucleusTreeProvider, openNucleusProject } from './providers/nucleusTreeProvider';
import { createNucleusProject } from './commands/createNucleusProject';
import { linkToNucleus } from './commands/linkToNucleus';

export function activate(context: vscode.ExtensionContext) {
    // ... existing code ...
    
    // Nucleus Tree Provider
    const nucleusProvider = new NucleusTreeProvider(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    );
    
    vscode.window.registerTreeDataProvider('bloomNucleus', nucleusProvider);
    
    // Register Nucleus commands
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.createNucleusProject', createNucleusProject),
        vscode.commands.registerCommand('bloom.linkToNucleus', linkToNucleus),
        vscode.commands.registerCommand('bloom.openNucleusProject', openNucleusProject),
        vscode.commands.registerCommand('bloom.syncNucleusProjects', () => nucleusProvider.refresh())
    );
    
    // ... rest of existing code ...
}
```

#### `generate_project_context.py` (EXTEND)
Add Nucleus support to Python script:

The spec document includes a `NucleusAnalyzer` class that should be added to `generate_project_context.py`. Key features:
- Detects organization from `.git/config`
- Scans parent directory for sibling projects
- Generates nucleus-specific context
- Creates organizational documentation templates

**Reference**: See `bloom-nucleus-spec.md` section on Python script modifications

---

## 🚀 Usage Workflow

### Creating a Nucleus Project

1. **Open parent directory** in VS Code (e.g., `/projects/`)
2. **Right-click** in Explorer → "Bloom: Create Nucleus Project"
3. **Enter** organization details:
   - Organization name (e.g., "JoseVigil")
   - GitHub URL (e.g., "https://github.com/JoseVigil")
   - Repository URL (auto-suggested)
4. **Result**: New folder `nucleus-{org}` with complete structure

### Linking a BTIP Project to Nucleus

1. **Open BTIP project** with existing `.bloom/` folder
2. **Right-click** project root → "Bloom: Link to Nucleus"
3. **Select** Nucleus project (auto-detected from parent directory)
4. **Enter** project details:
   - Display name
   - Description
   - Repository URL
5. **Result**: 
   - `nucleus.json` created in BTIP project
   - Project added to Nucleus registry
   - Overview file created in Nucleus

### Viewing Nucleus Hierarchy

1. **Open** Activity Bar → Bloom AI Bridge icon
2. **Navigate** to "Nucleus" view
3. **Browse** organizational structure:
   - 📱 Mobile projects
   - ⚙️ Backend projects
   - 🌐 Web projects
   - 🔧 Other projects
4. **Click** project to open in new window

---

## 📊 File Structure Comparison

### BTIP Project (Child)
```
bloom-video-server/
├── .bloom/
│   ├── core/
│   │   ├── .rules.bl
│   │   ├── .standards.bl
│   │   └── .prompt.bl
│   ├── project/
│   │   ├── .context.bl
│   │   └── .app-context.bl
│   ├── intents/
│   │   └── intent.bl
│   └── nucleus.json          ← Link to parent
└── [source code...]
```

### Nucleus Project (Parent)
```
nucleus-josevigil/
├── .bloom/
│   ├── core/
│   │   ├── nucleus-config.json  ← Identifier
│   │   ├── .rules.bl
│   │   └── .prompt.bl
│   ├── organization/
│   │   ├── .organization.bl
│   │   ├── about.bl
│   │   ├── business-model.bl
│   │   ├── policies.bl
│   │   └── protocols.bl
│   └── projects/
│       ├── _index.bl
│       ├── bloom-video-server/
│       │   └── overview.bl
│       └── bloom-mobile/
│           └── overview.bl
└── README.md
```

---

## 🔧 Implementation Checklist

- [ ] **Step 1**: Add Nucleus models to `bloomConfig.ts`
- [ ] **Step 2**: Create `NucleusStrategy.ts`
- [ ] **Step 3**: Update `ProjectDetector.ts` with Nucleus detection
- [ ] **Step 4**: Create `createNucleusProject.ts` command
- [ ] **Step 5**: Create `linkToNucleus.ts` command
- [ ] **Step 6**: Create `nucleusTreeProvider.ts`
- [ ] **Step 7**: Update `package.json` with new commands/views
- [ ] **Step 8**: Update `extension.ts` to register providers
- [ ] **Step 9**: Extend `generate_project_context.py` with `NucleusAnalyzer`
- [ ] **Step 10**: Test complete workflow

---

## 🧪 Testing Scenarios

### Test 1: Create Nucleus
1. Create new Nucleus project
2. Verify all `.bl` files are generated
3. Verify `nucleus-config.json` is valid JSON
4. Open generated files and check templates

### Test 2: Link Project
1. Create/Open BTIP project
2. Link to Nucleus
3. Verify `nucleus.json` created
4. Verify project appears in Nucleus config
5. Verify overview created in Nucleus

### Test 3: Tree View
1. Open workspace with Nucleus
2. Check Nucleus view appears
3. Verify projects grouped correctly
4. Test opening project from tree

### Test 4: Strategy Detection
1. Open Nucleus project
2. Verify detected as `nucleus` strategy
3. Generate context → should include org docs
4. Open linked BTIP project
5. Verify Nucleus link detected

---

## 📝 Template Locations

All templates are embedded in the command files as functions:

- `getNucleusRules()` - Core rules for Nucleus
- `getNucleusPrompt()` - Reading order instructions
- `getOrganizationTemplate()` - Main org header
- `getAboutTemplate()` - About page
- `getBusinessModelTemplate()` - Business model
- `getPoliciesTemplate()` - Development policies
- `getProtocolsTemplate()` - Operational protocols
- `getProjectsIndexTemplate()` - Projects tree
- `getReadmeTemplate()` - Root README

---

## 🎨 UI Enhancements

### Context Menu Additions
- "Bloom: Create Nucleus Project" - On folders
- "Bloom: Link to Nucleus" - On BTIP project roots

### Tree View
- New "Nucleus" section in Bloom AI Bridge sidebar
- Icons:
  - 🏢 Organization (nucleus root)
  - 📱 Mobile category
  - ⚙️ Backend category
  - 🌐 Web category
  - 🔧 Other category
  - ✅/🚧/📦 Status badges

### Status Bar
Consider adding status bar item showing:
- "🏢 Linked to: nucleus-josevigil" (when in BTIP project)
- "🏢 Nucleus: 5 projects" (when in Nucleus project)

---

## 🔍 Key Differences from BTIP

| Aspect | BTIP (Child) | Nucleus (Parent) |
|--------|--------------|------------------|
| **Purpose** | Technical code | Organizational docs |
| **Strategy** | `android`, `node`, etc. | `nucleus` |
| **Audience** | AI for coding | Humans + AI for analysis |
| **Content** | Code, intents | Policies, overviews |
| **Codebase** | Source files | Documentation files |
| **Structure** | `.bloom/project/` | `.bloom/organization/` |

---

## 💡 Future Enhancements

1. **Auto-sync**: Automatically update projects index when linking/unlinking
2. **Cross-project intents**: Support for intents that span multiple projects
3. **Dependency graph**: Visual representation of project relationships
4. **Nucleus templates**: Multiple org templates (startup, enterprise, open-source)
5. **Web dashboard**: Generate static site from Nucleus for documentation
6. **Import existing projects**: Bulk import and link existing projects
7. **Health checks**: Validate all linked projects are accessible

---

## 📚 Resources

- **Specification**: `bloom-nucleus-spec.md` (complete technical spec)
- **Original Plugin**: Current BTIP implementation
- **Python Script**: `generate_project_context.py` for context generation

---

## ✅ Success Criteria

The implementation is complete when:

1. ✅ User can create Nucleus project via command
2. ✅ User can link BTIP projects to Nucleus
3. ✅ Tree view shows organizational hierarchy
4. ✅ Nucleus strategy generates org documentation
5. ✅ All `.bl` templates are properly formatted
6. ✅ Project detector prioritizes Nucleus detection
7. ✅ Opening linked projects works from tree view
8. ✅ Projects index auto-updates with new links

---

**Version**: 1.0.0  
**Last Updated**: November 2025  
**Bloom BTIP Plugin** + **Nucleus Extension**