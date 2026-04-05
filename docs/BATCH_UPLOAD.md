# Batch Document Upload

Project Intel V2 can process multiple documents in a single upload, with each file assigned its own document type and extraction prompt.

## How to use

1. Open the app and click **Upload** in the sidebar.
2. Drag and drop one or more files onto the drop zone, or click to browse.
3. Each queued file shows a **Document Type** dropdown. Change the type if the automatic guess is wrong.
4. Click **Process All Documents**.
5. The app processes files sequentially and shows per-file status (Queued → Processing → Done/Error).
6. When complete, the summary shows total items extracted and quick links to the relevant tables.

### Automatic type guessing

When you add a file, the app inspects the filename and guesses a type:

| Filename contains        | Default type   |
|--------------------------|----------------|
| raid, risk, assumption   | RAID Log       |
| plan, roadmap, schedule  | Project Plan   |
| task, action, todo       | Task List      |
| budget, finance, cost    | Financial Data |
| (anything else)          | General        |

You can override the guess with the dropdown before processing.

## Document type classification

Each document type has a custom **extraction prompt** that tells the LLM what to look for. The five built-in system types are:

| Type           | Target model   | Focus                                               |
|----------------|----------------|-----------------------------------------------------|
| General        | mistral-nemo   | All project management items                        |
| RAID Log       | mistral-nemo   | Risks, Actions, Issues, Dependencies                |
| Task List      | mistral-nemo   | Actions and deadlines only                          |
| Project Plan   | llama3.1       | Full plan: actions, deadlines, dependencies, scope  |
| Financial Data | deepseek-r1    | Budget risks, cost actions, financial scope changes |

System types cannot be edited or deleted.

## Custom document types

Go to **Settings → Document Types** to create your own:

1. Click **Add Custom Type**.
2. Enter a name (e.g. "Weekly Status Report").
3. Write an extraction prompt. The prompt is sent to the LLM with the document text appended.
4. Pick a target model from the dropdown (populated from your Ollama instance).
5. Click **Save**.

Your custom type then appears in the document type dropdown when uploading.

### Prompt writing tips

- Be specific about what to extract: "Extract only action items that have an owner or due date."
- State the expected output format: "Return only valid JSON with arrays: actions, risks, deadlines."
- Use the built-in prompts (expandable in Settings) as templates.
- Keep prompts under 5,000 characters.

## Excel file requirements

Excel files (`.xlsx`) are supported with these constraints:

- **First sheet only.** Additional sheets are ignored.
- **Values only.** Formulas are evaluated to their results; cell colours, borders, and formatting are stripped.
- **Merged cells.** The value appears in the top-left cell of the merged range; other cells in the range are shown as empty.
- **Empty rows.** Fully blank rows are skipped automatically.
- **First non-empty row = header.** The converter treats it as the column header row.

The sheet is converted to a Markdown table before being sent to the LLM:

```
| Type   | Description                  | Owner | Impact | Status |
|--------|------------------------------|-------|--------|--------|
| Risk   | Vendor delivery delayed      | Alan  | High   | Open   |
| Action | Review vendor proposal       | Alan  | High   | Open   |
```

For best results, structure your spreadsheet with clear column headers and one item per row.

## Supported file formats

| Extension | Format              |
|-----------|---------------------|
| `.pdf`    | PDF (text-based)    |
| `.docx`   | Word document       |
| `.xlsx`   | Excel workbook      |
| `.txt`    | Plain text          |
| `.md`     | Markdown            |

> Scanned PDFs (image-only) cannot be extracted — the text layer must be present.

## API reference

### POST /documents/batch-upload

Upload multiple files in one request.

**Form data:**

| Field       | Type            | Description                                    |
|-------------|-----------------|------------------------------------------------|
| `files`     | File (repeated) | One or more files                              |
| `type_ids`  | int (repeated)  | DocumentType ID for each file (parallel order) |

**Response:** array of per-file result objects.

```json
[
  {
    "filename": "raid_log.xlsx",
    "success": true,
    "doc_id": 42,
    "extracted": {
      "actions": 3,
      "risks": 2,
      "deadlines": 1,
      "dependencies": 1,
      "scope_items": 0
    }
  },
  {
    "filename": "bad_file.csv",
    "success": false,
    "error": "Unsupported file type '.csv'. Allowed: ['.docx', '.eml', ...]"
  }
]
```

**Error behaviour:**

- If one file fails, the endpoint continues processing remaining files.
- The response is always HTTP 200 with per-file `success: false` entries for failed files.
- A 422 is returned only if `len(files) != len(type_ids)`.

## Running the tests

```powershell
# From repo root, with backend running:
python tests/create_test_data.py     # generate sample files (once)
python tests/test_batch_upload.py    # run integration tests
```

The test script covers:
- Batch upload with XLSX, DOCX, and PDF in one request
- Extraction counts verified against the database
- Unsupported file type (graceful per-file failure)
- Mismatched files/type_ids count (HTTP 422)
- Custom document type CRUD (create, rename, delete)
- System type deletion blocked (HTTP 403)
