---
name: "sync-doc-changes"
description: "Synchronizes changes across all documents in ./doc directory, updates README.md and project_memory.md. Invoke when user says 'sync documents', 'sync after updating XX doc', or 'refresh doc index'."
---

# Sync Doc Changes

This skill synchronizes changes across all project documentation files, ensuring consistency between requirements, architecture, detailed design, test cases, README, and project memory.

---

## When to Invoke

**Invoke this skill IMMEDIATELY when:**

1. **Explicit Sync Request:**
   - User says "同步文档" or "sync documents"
   - User says "更新了 XX 文档，帮我同步其他文档"
   - User says "同步一下" after modifying ./doc files
   - User says "更新文档索引" or "refresh doc index"

2. **Implicit Trigger Context:**
   - User just finished modifying any file in `./doc/` directory
   - User mentions updating requirements, architecture, or design documents
   - User says "文档有更新" or "docs changed"

3. **Post-Generation Sync:**
   - After generating any document in ./doc/ (PRD, architecture, detailed design, test cases)
   - User says "生成完了，同步一下"

---

## Workflow

Execute the following steps sequentially:

### Step 1: Detect Changed Document

1. Ask user which document was modified, OR infer from context
2. Supported documents:
   - `./doc/0.requirements_document.md` - Requirements Document (PRD)
   - `./doc/1.software_architecture_document.md` - Architecture Design
   - `./doc/2.detailed_design_specification.md` - Detailed Design
   - `./doc/3.detailed_test_cases.md` - Test Cases

### Step 2: Read Changed Document

1. Read the modified document to extract:
   - Version info and change history
   - Updated requirements/features
   - New constraints or decisions
   - Key architectural changes

### Step 3: Propagate Changes to Other Documents

Update related documents based on the changed document:

| Changed Document | Updates To |
|---|---|
| **0.requirements_document.md** | Architecture (tech stack, constraints), Detailed Design (features), Test Cases (acceptance criteria) |
| **1.software_architecture_document.md** | Requirements (NFR updates), Detailed Design (module structure), Test Cases (compatibility tests) |
| **2.detailed_design_specification.md** | Test Cases (unit test targets), Architecture (implementation details) |
| **3.detailed_test_cases.md** | Requirements (coverage gaps), Detailed Design (testability) |

**Update Rules:**
- Use relative paths for all references (`./doc/`, `./src/`, `./res/`)
- Update version numbers if significant changes
- Add change log entries with date and description
- Maintain cross-references consistency

### Step 4: Update README.md

Update the root `./README.md` with:

1. **Project Overview** - Sync with requirements document
2. **Documentation Index** - List all ./doc files with descriptions
3. **Quick Links** - Relative path links to key documents
4. **Version Info** - Current document versions
5. **Last Updated** - Timestamp of latest sync

**README Template Section:**

```markdown
## Project Documentation

| Document | Path | Description | Version |
|---|---|---|---|
| Requirements Document | [0.requirements_document.md](./doc/0.requirements_document.md) | PRD with acceptance criteria | V1.0.0 |
| Architecture Design | [1.software_architecture_document.md](./doc/1.software_architecture_document.md) | 4+1 view architecture | V1.0.0 |
| Detailed Design | [2.detailed_design_specification.md](./doc/2.detailed_design_specification.md) | Module-level design | V1.0.0 |
| Test Cases | [3.detailed_test_cases.md](./doc/3.detailed_test_cases.md) | System & unit tests | V1.0.0 |

**Last Synced:** YYYY-MM-DD
```

### Step 5: Update Project Memory

Update the project memory file at:
`~/.trae-cn/memory/projects/{project-hash}/project_memory.md`

**Update Content:**

1. **Core Document Index** - Ensure all ./doc paths are listed
2. **Key Decisions** - Extract new technical decisions from updated docs
3. **Constraints** - Sync any new project-level constraints
4. **Pending Tasks** - Update based on latest requirements/design

**Memory Update Template:**

```markdown
## 核心文档索引 (Key Documents)

所有项目文档位于 `./doc/` 目录：

| 文档 | 路径 | 用途 | 最后更新 |
|---|---|---|---|
| 需求文档 (PRD) | `./doc/0.requirements_document.md` | 产品需求、验收标准 | YYYY-MM-DD |
| 架构设计 | `./doc/1.software_architecture_document.md` | 4+1 视图架构 | YYYY-MM-DD |
| 详细设计 | `./doc/2.detailed_design_specification.md` | 模块级设计 | YYYY-MM-DD |
| 测试用例 | `./doc/3.detailed_test_cases.md` | 系统与单元测试 | YYYY-MM-DD |
```

### Step 6: Summary Report

Provide a sync summary:

```markdown
## Document Sync Complete

**Changed Document:** {document_name}
**Sync Time:** {timestamp}

**Updated Files:**
- [ ] {doc1} - {change_type}
- [ ] {doc2} - {change_type}
- [ ] README.md - Updated index
- [ ] project_memory.md - Updated references

**Key Changes Propagated:**
- {change_1}
- {change_2}
```

---

## Constraints

- **Must Do:** Always use relative paths (e.g., `./doc/`, `./src/`)
- **Must Do:** Update version numbers in all affected documents
- **Must Do:** Add change log entries for significant updates
- **Must Do:** Preserve existing content, only add/update relevant sections
- **NEVER:** Delete existing document content without user confirmation
- **NEVER:** Hardcode absolute paths or domain names in document links

---

## Example Usage

**Input:**
> 我刚更新了需求文档，帮我同步一下其他文档

**Output:**
1. Read `./doc/0.requirements_document.md`
2. Extract new requirements FR-005, FR-006
3. Update `./doc/1.software_architecture_document.md` with new architecture constraints
4. Update `./doc/2.detailed_design_specification.md` with new feature modules
5. Update `./doc/3.detailed_test_cases.md` with new test scenarios
6. Update `./README.md` with new documentation index
7. Update `project_memory.md` with new document references
8. Provide sync summary

---

## File Paths Reference

| Target | Path |
|---|---|
| Requirements Document | `./doc/0.requirements_document.md` |
| Architecture Design | `./doc/1.software_architecture_document.md` |
| Detailed Design | `./doc/2.detailed_design_specification.md` |
| Test Cases | `./doc/3.detailed_test_cases.md` |
| README | `./README.md` |
| Project Memory | `~/.trae-cn/memory/projects/{project-hash}/project_memory.md` |

---

## Notes

- This skill focuses on **synchronization**, not document generation
- For generating new documents, use corresponding skills: `generate-requirements-document`, `generate-software-architecture-design`, etc.
- This skill is designed for maintaining consistency after manual or skill-generated document updates