DROPOWAY — SMART SCAN INTELLIGENCE & DELIVERY WORKFLOW UPGRADE

FULL IMPLEMENTATION TASK

Repository: "https://github.com/EnJirad/Dropway.git"

You are acting as a Senior Full-Stack Engineer, AI Integration Engineer, OCR Specialist, Database Architect, and Mobile UX Engineer.

Your task is to upgrade the existing Dropway application into a highly accurate, AI-assisted parcel label scanning, recipient identification, house matching, parcel management, and daily navigation system.

This is a continuation of an existing project. Do not rebuild the application from scratch.

The current project already has camera scanning, Tesseract.js OCR, house matching, navigation, a house catalog, a Neon database, and parcel-related functionality. Your job is to improve and extend the existing system while preserving working functionality.

You must inspect the actual current code before deciding what needs to change.

---

0. CRITICAL EXECUTION RULES

Repository and project safety

- Verify the repository URL, current branch, local HEAD, remote HEAD, and working-tree status before modifications.
- Read ".ai/AI_RULES.md", ".ai/AI_HANDOFF.md", ".ai/CURRENT_STATE.md", ".ai/PROJECT_CONTEXT.md", ".ai/ARCHITECTURE.md", and ".ai/WORKFLOW.md" as applicable.
- Verify the actual repository identity. Resolve any discrepancy between the GitHub URL and repository URLs mentioned in project documentation before making changes.
- Inspect all relevant source files, database schema, API routes, navigation logic, scan components, and existing settings architecture.
- Do not overwrite, discard, reset, or revert existing user changes.
- Do not use destructive Git commands.
- Do not create duplicate systems for houses, parcels, navigation, scanning, or AI configuration.
- Reuse existing architecture and components whenever possible.
- Do not introduce mock data, fake OCR results, fake AI responses, fake map locations, or simulated database success.
- Never claim a test or build succeeded unless it actually ran and passed.
- Keep the implementation compatible with the current Next.js, TypeScript, Neon, and deployment architecture.
- Minimize unnecessary dependencies and bundle size.
- Do not break authentication, database access, house management, navigation, or delivery status features.
- Follow the project's Git and deployment rules. Stage only files related to this task.
- Complete the entire task, not just the audit or planning.

Create and maintain a detailed implementation checklist, but continue working through it autonomously.

---

1. CORE GOAL

Improve parcel scanning so it can accurately identify information from parcel labels and compare it with the existing House Catalog using both OCR and AI assistance.

The user scans a label.

The system should:

1. Read the image.
2. Detect barcodes and Tracking numbers.
3. Extract all text using OCR.
4. Use AI to analyze the label and interpret its structure.
5. Extract recipient name, phone, house number, address, and Tracking number.
6. Compare these fields against existing houses.
7. Identify the most likely house and explain why.
8. Show all extracted fields in an editable review interface.
9. Allow selecting an existing house or correcting the extracted information.
10. Let the user save a new house without adding a parcel to navigation.
11. Let the user add a parcel to today's navigation without necessarily creating a permanent house.
12. Let the user dismiss the scan without saving anything.

The system must be practical for daily delivery operations involving approximately 100–250 parcels.

---

2. PHASE A — FULL EXISTING IMPLEMENTATION AUDIT

Before coding, thoroughly inspect:

- "src/app/scan/page.tsx"
- "src/lib/parcelMatch.ts"
- "src/app/api/houses/match/route.ts"
- "src/app/api/houses/route.ts"
- "src/app/api/houses/[id]/route.ts"
- "src/app/api/navigation/route.ts"
- "src/app/api/navigation/[id]/route.ts"
- "src/app/navigation/page.tsx"
- "src/app/houses/page.tsx"
- "src/types/house.ts"
- "src/types/navigation.ts"
- Database initialization and auto-schema logic.
- Neon schema and migrations.
- Existing "parcels" table and relationships.
- Existing Tracking storage and duplicate detection.
- Existing settings or configuration pages.
- Existing authentication and API authorization.
- Existing deployment environment variables.
- Current AI/OCR dependencies and capabilities.

Verify whether the existing database schema and runtime auto-schema logic are consistent, especially the "parcels" table and Tracking-related columns.

Determine what already works and what needs improvement.

Do not replace the existing implementation just because a cleaner architecture is imaginable.

Create a task checklist, then immediately begin implementation.

---

3. PHASE B — AI-ASSISTED PARCEL LABEL ANALYSIS

3.1 Add Real AI Label Intelligence

The current scanning system uses OCR and text-based matching.

Upgrade it with a real AI analysis layer that can understand parcel label images and their context.

AI must be capable of analyzing:

- Label layout.
- Recipient information.
- Thai and English names.
- Thai addresses.
- House numbers.
- Phone numbers.
- Tracking numbers.
- Barcode contents.
- Multiple text blocks.
- Ambiguous or missing fields.
- OCR mistakes.
- Conflicting information.

AI must not merely reformat the OCR text. It should analyze the original label image when image-capable AI is available, compare it with OCR text, and use contextual information to improve extraction.

---

3.2 AI Extraction Schema

Create a validated structured output format.

Use an appropriate schema similar to:

type ParcelLabelAnalysis = {
  recipientName: string | null;
  phone: string | null;
  houseNumber: string | null;

  address: {
    raw: string | null;
    subdistrict: string | null;
    district: string | null;
    province: string | null;
    postalCode: string | null;
  };

  trackingNumber: string | null;
  barcodeValue: string | null;

  rawOcrText: string;
  confidence: {
    recipientName: number | null;
    phone: number | null;
    houseNumber: number | null;
    address: number | null;
    trackingNumber: number | null;
  };

  warnings: string[];
  uncertainFields: string[];
  reasoningSummary: string;
};

Adapt this schema to the existing TypeScript conventions.

Requirements:

- All extracted fields must be optional or nullable when missing.
- AI must not invent information.
- AI must not guess GPS coordinates.
- AI must not fabricate a Tracking number.
- AI must distinguish the house number from village number, road number, postal code, phone number, and Tracking number.
- AI must not mistake a sender's address for a recipient's address.
- AI must identify potential sender/recipient ambiguity.
- AI must preserve raw extracted text.
- AI must return valid JSON matching the schema.
- Validate AI output server-side before returning it to the client.
- Treat all AI responses as untrusted input.

---

4. PHASE C — MULTI-ENGINE OCR AND AI COMPARISON

Build a recognition pipeline that can combine multiple sources of evidence.

Preferred workflow

1. Barcode recognition.
2. Existing Tesseract.js OCR.
3. Image preprocessing.
4. Structured text parsing.
5. AI Vision analysis.
6. Comparison and validation.
7. House matching.

Do not call AI unnecessarily if local OCR and barcode recognition are already reliable.

AI-assisted correction

When OCR and AI disagree, do not blindly select one.

Examples:

- OCR reads house number "55/2"; AI reads "55/7".
- OCR detects one phone number; AI detects a different number.
- OCR identifies a recipient name that differs from the AI.
- Barcode and text Tracking numbers disagree.

The system must:

- Identify the conflict.
- Mark the field as uncertain.
- Show the competing values.
- Allow manual correction.
- Avoid silently saving uncertain data.

Confidence

Confidence must be calculated or interpreted per field, not just per image.

Use evidence from:

- OCR confidence.
- AI confidence or evaluation.
- Barcode confidence.
- Format validation.
- Database matching.
- Agreement between engines.
- Image quality.

Do not falsely convert an AI guess into a 100% confidence value.

---

5. PHASE D — AI PROVIDER CONFIGURATION & SETTINGS CENTER

Create or upgrade a proper Settings Center for Dropway.

The user must be able to configure AI providers without modifying source code.

Create a dedicated Settings page using the existing design system and navigation architecture.

A suitable route may be "/settings", but verify the existing architecture first.

5.1 AI Provider Settings

Allow configuration of:

- Provider.
- API Key.
- Model.
- API endpoint / Base URL where supported.
- Default AI model.
- Vision-capable model selection.
- AI enable/disable.
- AI fallback enable/disable.
- AI timeout.
- Maximum retries.
- Request limits.
- AI confidence thresholds.
- AI usage tracking.

Support a provider architecture that can be extended in the future.

Evaluate providers such as:

- Google Gemini.
- OpenAI.
- OpenAI-compatible API providers.
- OpenRouter.
- Other compatible vision-capable providers.

Do not hardcode the application to one AI provider.

5.2 Flexible API Integration

The user should be able to configure a compatible API with:

- API key.
- Provider.
- Model name.
- Endpoint/Base URL, when supported.

Implement a provider abstraction with appropriate adapters.

For example:

- Gemini native API adapter.
- OpenAI-compatible API adapter.
- Provider-specific adapters as required.

Do not assume every OpenAI-compatible provider supports image input or the same response format.

Validate capabilities before enabling a provider for label-image analysis.

5.3 Settings UI

Create a professional mobile-friendly Settings Center with sections such as:

AI Provider

- Provider dropdown.
- API Key input.
- Model selection/input.
- Custom endpoint input when applicable.
- Enable/disable toggle.
- Default provider.
- Test connection button.
- Test image analysis button, if practical.
- Connection status.
- Clear/update API key.

Scan Intelligence

- Local OCR enabled.
- AI analysis enabled.
- AI fallback enabled.
- OCR-first or AI-assisted mode.
- Confidence threshold.
- Automatic matching threshold.
- Manual confirmation threshold.
- Barcode priority.
- AI timeout.
- Retry count.
- Image quality requirements.

Privacy

- AI image upload enabled/disabled.
- Explain what information will be sent to the configured AI provider.
- Option to disable AI analysis for all scans.
- Option to use local OCR only.
- Never transmit recipient images if AI upload is disabled.
- Avoid retaining images unnecessarily.
- Do not log personal label data.

Usage

Where possible, show:

- AI requests today.
- Total AI requests.
- Provider.
- Last request.
- Error count.
- Rate-limit status.
- Estimated cost when provider pricing is known and reliably calculated.

Do not display fabricated usage metrics.

5.4 API Key Security

API keys must never be:

- Hardcoded into source files.
- Exposed in client JavaScript.
- Returned by API endpoints.
- Stored in plaintext in localStorage.
- Included in Git commits.
- Written to logs.
- Included in error messages.

Prefer secure server-side storage.

If the application needs database storage for user-configured keys:

- Encrypt keys before storing them.
- Use a server-only encryption secret such as "AI_SETTINGS_ENCRYPTION_KEY".
- Use a strong encryption method such as AES-256-GCM.
- Keep the encryption key in deployment environment variables.
- Never expose the encryption key to the browser.
- Restrict access to AI settings APIs.
- Scope settings to the authenticated user where the current auth architecture supports it.
- Preserve existing security and ownership checks.
- Provide a secure API key update and deletion flow.
- Mask saved keys in the UI.
- Never return decrypted keys to the frontend.
- Provide an explicit configuration error if secure storage is unavailable.

If secure key persistence cannot be implemented safely in the current environment, do not create a weak or plaintext fallback. Implement a secure configuration path and clearly document the required environment variable or deployment configuration.

5.5 Provider Testing

The Test Connection button must perform a real backend request.

It must report:

- Success.
- Invalid API key.
- Invalid model.
- Unsupported image capability.
- Provider unavailable.
- Rate limit exceeded.
- Timeout.
- Other relevant errors.

Do not simulate connection success.

---

6. PHASE E — SMART HOUSE MATCHING

Improve the existing "parcelMatch.ts" logic and API without unnecessarily replacing it.

Matching signals

Evaluate:

- Exact normalized recipient name.
- Name similarity.
- Phone number.
- House number.
- Full address.
- Subdistrict.
- District.
- Province.
- Existing stored relationship.
- OCR evidence.
- AI extraction evidence.

House number and phone should be treated as important evidence.

Do not use Tracking as a permanent House identifier.

Match outcomes

Categorize candidates:

- High-confidence match.
- Probable match.
- Multiple candidates.
- No match.
- Conflicting data.

Provide explanations.

Examples:

- Name matches exactly.
- Phone matches.
- House number matches.
- Address matches.
- Name similarity only.
- Phone conflict.
- House number conflict.
- AI and OCR disagree.

Matching UI

Display candidates as selectable rows/cards.

Each candidate should show:

- Name.
- Phone.
- House number.
- Address.
- GPS availability.
- Match score/confidence.
- Match explanation.

The user must be able to select a candidate manually.

Do not auto-select an uncertain candidate without clear confirmation.

---

7. PHASE F — EDITABLE SCAN REVIEW MODAL

This is one of the most important requirements.

After scanning and analyzing a parcel, automatically populate an editable form.

The scan result must not be a read-only summary.

7.1 Editable Fields

Display and allow editing of:

- Recipient name.
- Phone number.
- House number.
- Full address.
- Subdistrict.
- District.
- Province.
- Postal code.
- Tracking number.
- Additional note, where appropriate.

The user must be able to tap any field and correct the OCR/AI result.

The form should be populated automatically before the user sees it.

Do not require the user to manually type all fields.

7.2 Existing House Selection

When the system finds a likely existing house:

- Display the matching house information.
- Show the match confidence and reasons.
- Allow the user to select the existing house.
- Provide an obvious selection control, including a checkbox or radio selection.
- Tapping the house row or selection control must open an editable modal/detail popup.
- The modal must allow the user to edit the selected house's stored name, phone, and address.
- Show existing stored values and newly scanned values.
- Clearly indicate which values are different.
- Allow the user to choose which values to update.
- Do not overwrite existing data without user confirmation.
- Save the edits to the actual database.
- After saving, update the selected house and scan result immediately.

The edit modal must support:

- Save.
- Cancel.
- Close (X).
- Unsaved-change warning when appropriate.
- Loading state.
- Error state.
- Mobile keyboard handling.
- Scrollable content on mobile.

Do not use fake save operations.

7.3 Newly Scanned House

When a new house is detected:

- Automatically fill the form with AI/OCR-extracted data.
- Let the user edit everything.
- Show GPS as unavailable by default.
- Do not fabricate coordinates.
- Allow the user to add coordinates later in the House Catalog or Map Picker.
- Do not save the Tracking number to the permanent House record.

---

8. PHASE G — EXACTLY THREE SCAN ACTIONS

The scan review interface must have three clear actions.

Action 1 — Save House

Label:

Save House

Purpose:

Create or update the permanent House Catalog record only.

This action must:

- Save recipient name.
- Save phone.
- Save house number/address information.
- Save additional permanent house information where appropriate.
- NOT save the parcel Tracking number into the House record.
- NOT automatically add a parcel to today's navigation.
- NOT automatically create GPS coordinates.
- NOT require the user to have GPS coordinates.
- NOT create a daily delivery record.
- Check for duplicate houses before creating a new one.
- Update the existing House if the user selected an existing record and explicitly confirmed the edits.

After success:

- Show a real success state.
- Update the house catalog.
- Provide a clear next action, but do not automatically add navigation.

Action 2 — Add to Today's Navigation

Label:

Add to Today's Navigation

Purpose:

Add the scanned parcel to today's delivery workflow.

This action must:

- Include the Tracking number when available.
- Allow a missing Tracking number.
- Use the selected existing house when appropriate.
- Reuse the existing navigation stop for the same house.
- Create a new parcel record for the scanned parcel.
- Increase parcel count.
- Prevent duplicate route stops.
- Detect duplicate Tracking numbers within the appropriate delivery scope.
- Allow different Tracking numbers for the same recipient/house.
- Preserve daily parcel history.
- Support adding a parcel without a permanent House ID where the architecture can safely support it.
- Allow missing GPS coordinates.
- Never require saving a permanent house first.

If the destination already exists in today's navigation:

- Show existing parcel count.
- Show existing Tracking numbers.
- Add the new parcel when it is not a duplicate.
- Do not create another destination stop.
- Update the UI immediately after successful persistence.

Action 3 — Close (X)

Purpose:

Dismiss the scan result.

This action must:

- Close the modal.
- Discard unsaved changes.
- Stop any active image-processing operation when safe.
- Reset the scan state.
- Avoid writing any data to the database.
- Avoid saving the house.
- Avoid adding navigation.
- Avoid saving Tracking.

The X button must always be clearly visible and functional.

---

9. PHASE H — UNMATCHED HOUSE: TWO INDEPENDENT OPTIONS

When no house matches, the user must still be able to proceed.

The result must show:

- Extracted recipient name.
- Phone number.
- House number.
- Address.
- Tracking number.
- OCR/AI confidence.
- Uncertainty warnings.
- Editable fields.

The user must have both options:

Save House

Creates the permanent house record.

- Does not add today's navigation.
- Does not save Tracking in the house record.
- Does not create GPS coordinates.
- Allows manual editing.

Add to Today's Navigation

Creates today's parcel/delivery entry without requiring a permanent house.

- Tracking number is attached to the parcel.
- Destination text is stored for today's delivery.
- GPS may be missing.
- A permanent House ID may be absent.
- The user can locate or associate the destination with a permanent house later.

These options must be independent.

Do not force the user to save a new house before adding it to navigation.

---

10. PHASE I — PARCEL AND TRACKING ARCHITECTURE

Inspect the existing parcel schema and navigation workflow before changing anything.

Rules

- One physical parcel = one Parcel record.
- A house can have multiple parcels.
- A recipient can have multiple parcels.
- Tracking belongs to an individual parcel.
- Tracking is optional.
- House records must not contain daily parcel Tracking numbers.
- Different Tracking numbers for the same house are separate parcels.
- The same house can be a single navigation stop containing multiple parcels.
- Do not create duplicate stops for the same destination unnecessarily.
- Duplicate Tracking detection must use the correct delivery scope.
- A Tracking duplicate should be flagged, not silently discarded.
- Missing Tracking numbers must not cause false duplicate rejection.
- Recipient name alone must never be the duplicate key.

Ensure the existing database and runtime schema are consistent.

If migrations are needed:

- Preserve existing data.
- Avoid destructive migrations.
- Use safe migrations.
- Add indexes where justified.
- Ensure backward compatibility.
- Update schema documentation.
- Verify actual database behavior.

Do not create a parallel parcel system.

---

11. PHASE J — BATCH SCAN

Improve the scanning workflow to support multiple parcels efficiently.

Implement where compatible with the existing architecture:

- Multiple image capture.
- Gallery multi-selection.
- Consecutive scanning.
- Batch processing queue.
- OCR for each image.
- AI analysis for uncertain labels.
- Barcode extraction.
- Editable batch results.
- House matching.
- Duplicate warnings.
- Selection of individual results.
- Add selected parcels to today's navigation.
- Save houses independently.
- Retry failed scans.
- Cancel batch processing.
- Clear batch.

Use controlled concurrency and avoid excessive memory consumption.

One failed image must not abort the entire batch.

Support a mobile-friendly card/table interface with:

- Recipient.
- Phone.
- House number.
- Address.
- Tracking.
- Match status.
- Confidence.
- Selection control.
- Editing action.

The batch workflow must allow processing 100–250 parcels without requiring the user to open every parcel individually.

---

12. PHASE K — OCR ENGINE IMPROVEMENT

Evaluate the existing Tesseract.js engine and alternative Thai OCR options.

Evaluate PaddleOCR and suitable Thai recognition models only if they can be practically deployed in the existing architecture.

Compare:

- Thai name recognition.
- House number recognition.
- Phone number recognition.
- Address recognition.
- Tracking extraction.
- Mobile performance.
- Memory use.
- Deployment complexity.
- Cost.
- Privacy.

Do not add a heavyweight OCR dependency merely because it has a high benchmark score.

Implement:

- OCR worker reuse.
- Lazy initialization.
- Proper worker cleanup.
- Image preprocessing.
- Barcode-first Tracking extraction.
- Field-level confidence.
- Validation.
- AI-assisted correction.
- Fallback when AI is unavailable.

Do not require an AI API for basic scanning.

---

13. PHASE L — GPS AND MAP PICKER

Preserve existing Google Maps navigation behavior.

Improve missing-coordinate handling:

- Display clearly when a house has no coordinates.
- Provide a Map Picker action.
- Allow GPS current-location capture.
- Allow tap-to-place marker.
- Allow marker dragging.
- Confirm coordinates.
- Save to the existing House record.
- Allow cancel without saving.
- Do not fabricate coordinates.
- Clearly distinguish GPS-derived coordinates from manually selected or geocoded coordinates.
- Handle permissions and map errors.

If the project already uses Google Maps links, preserve them.

Evaluate Leaflet/OpenStreetMap only if it provides a practical benefit and fits existing dependencies and licensing.

Do not introduce paid services without documenting their cost.

---

14. PHASE M — SETTINGS CENTER DESIGN

Create a professional, practical Settings Center.

Organize it into tabs or sections.

AI Configuration

- AI enable/disable.
- Provider selection.
- API Key.
- Model name.
- Custom endpoint.
- Default provider.
- Test connection.
- Test image analysis.
- Saved key masked.
- Update key.
- Remove key.

Scanning

- Local OCR toggle.
- AI Vision toggle.
- AI fallback toggle.
- Barcode-first toggle.
- OCR language configuration.
- Confidence thresholds.
- Auto-match thresholds.
- Manual confirmation threshold.
- Retry settings.
- Timeout settings.

Privacy

- Allow image upload to AI.
- Local-only mode.
- Data retention policy.
- Display what data is sent to AI.
- Clear AI usage history where supported.
- No unnecessary image storage.

Performance

- OCR worker reuse.
- Batch concurrency.
- Image size limit.
- Scan quality settings.
- Processing timeout.
- Retry behavior.

Usage

- AI request count.
- Daily usage.
- Error count.
- Provider status.
- Rate-limit status.
- Estimated cost only when reliable.

General Settings

- User preferences.
- Scan workflow defaults.
- Navigation behavior.
- Mobile interface preferences.

Do not add settings that do not control a real implemented behavior.

Every setting must be connected to real functionality.

---

15. PHASE N — AI SAFETY, PRIVACY, AND FALLBACK

AI must assist the operator, not make irreversible decisions.

Requirements:

- AI output must be validated.
- AI must not automatically create houses.
- AI must not automatically overwrite existing house data.
- AI must not automatically assign a parcel when multiple houses are ambiguous.
- AI must not invent coordinates.
- AI must not invent Tracking numbers.
- AI must not fabricate phone numbers.
- AI must not invent addresses.
- AI must not expose API keys.
- AI must not log full parcel labels.
- AI must not be required for basic scanning.
- AI provider errors must not break the scanner.
- Rate limits must be handled gracefully.
- Timeout handling must be implemented.
- Fallback to local OCR must remain available.

If AI is disabled or unavailable:

Barcode
→ Local OCR
→ Field Extraction
→ House Matching
→ Editable Review

The user must still be able to complete the workflow.

---

16. PHASE O — PERFORMANCE AND REAL-WORLD OPERATION

Optimize for mobile delivery operations.

Targets to evaluate:

- Minimal scanning steps.
- Low camera startup overhead.
- Reusable OCR worker.
- Efficient barcode scanning.
- Resource-aware batch processing.
- Fast matching.
- Responsive interface.
- No unnecessary network requests.
- No AI calls for already reliable scans.
- No repeated full database scans when avoidable.
- No excessive database writes.
- Stable processing of 100–250 parcels daily.

Measure actual performance where possible.

Do not claim measured speed or accuracy unless tests were performed.

---

17. PHASE P — TESTING

Implement and run relevant tests.

AI Provider Tests

- Valid key.
- Invalid key.
- Invalid model.
- Unsupported image model.
- Provider timeout.
- Provider unavailable.
- Rate limit.
- Invalid response.
- Malformed JSON.
- Missing fields.
- AI disabled.
- Local fallback.

OCR Tests

- Thai names.
- English names.
- Mixed-language names.
- Phone numbers.
- House numbers.
- Addresses.
- Tracking numbers.
- Missing fields.
- Rotated images.
- Blurry labels.
- Low-light labels.
- Conflicting sender/recipient information.

Matching Tests

- Exact name.
- Exact phone.
- Exact house number.
- Exact address.
- Name variations.
- OCR errors.
- Multiple candidates.
- Conflicting phone.
- Conflicting house number.
- No match.

Save House Tests

- Save house only.
- Save house without GPS.
- Save house without Tracking.
- Edit existing house.
- Duplicate house warning.
- Cancel edit.
- X dismiss without saving.
- No unintended parcel creation.

Navigation Tests

- Add parcel to existing house.
- Add parcel to unmatched destination.
- Existing destination.
- Different Tracking for same house.
- Same Tracking duplicate.
- Missing Tracking.
- Missing GPS.
- Parcel count.
- No duplicate route stops.
- X dismiss.
- Navigation update after persistence.

Batch Tests

- Multiple images.
- OCR failure.
- AI failure.
- Barcode failure.
- Duplicate scans.
- Unmatched labels.
- Manual correction.
- Selected-only submission.
- Cancel.
- Retry.
- Large batch.

Settings Tests

- Save provider.
- Change provider.
- Update key.
- Mask key.
- Remove key.
- Test connection.
- Disabled AI.
- Privacy settings.
- Provider fallback.
- No secret leakage to client.

---

18. IMPLEMENTATION CHECKLIST

Maintain a persistent checklist throughout the work.

- [ ] Repository and instructions verified.
- [ ] Existing scan workflow audited.
- [ ] Existing parcel and Tracking architecture audited.
- [ ] Existing schema and runtime migrations verified.
- [ ] AI provider architecture implemented.
- [ ] AI provider settings implemented.
- [ ] Secure API key handling implemented.
- [ ] Test Connection implemented.
- [ ] OCR engine optimized.
- [ ] Barcode recognition improved.
- [ ] AI label analysis implemented.
- [ ] Structured field extraction implemented.
- [ ] Field-level confidence implemented.
- [ ] Conflict detection implemented.
- [ ] House matching improved.
- [ ] Candidate selection improved.
- [ ] Editable scan review implemented.
- [ ] Existing house edit modal implemented.
- [ ] Save House action implemented.
- [ ] Add to Today's Navigation action implemented.
- [ ] Close/X discard action implemented.
- [ ] Unmatched parcel workflow implemented.
- [ ] Multiple parcels per house supported.
- [ ] Tracking stored per parcel.
- [ ] Tracking duplicate detection corrected.
- [ ] Batch scanning implemented.
- [ ] Map Picker implemented or improved.
- [ ] GPS handling improved.
- [ ] Settings Center implemented.
- [ ] Privacy safeguards implemented.
- [ ] Performance optimized.
- [ ] Tests implemented.
- [ ] Tests executed.
- [ ] Regression review completed.
- [ ] Documentation updated.
- [ ] AI handoff updated.
- [ ] Git diff reviewed.
- [ ] Git workflow completed according to repository rules.
- [ ] Remote push verified if authorized and required.

---

19. FINAL REPORT

After finishing all implementation work, provide a clear report containing:

1. What was implemented
2. AI providers supported
3. How API keys are securely configured
4. How AI analyzes parcel images
5. How OCR and AI results are compared
6. How recipient and house matching works
7. How the editable scan modal works
8. Save House behavior
9. Add to Today's Navigation behavior
10. X / cancel behavior
11. Tracking and multiple parcels per house
12. Batch scanning behavior
13. Settings Center features
14. Database changes
15. Files modified
16. Tests executed and results
17. Build status
18. Deployment status
19. Commit SHA and push status, if applicable
20. Remaining limitations or blockers

Clearly separate verified results from assumptions.

Do not report unfinished work as completed.

---

FINAL DIRECTIVE

Implement this entire upgrade as a coherent system.

The existing Dropway scanner is a foundation, not a finished intelligent label-recognition workflow.

Improve it substantially.

The AI must genuinely help analyze labels, extract fields, compare results, detect conflicts, and improve house matching.

The user must be able to correct scanned information immediately.

The user must be able to save a permanent house independently of today's navigation.

The user must be able to add a parcel to today's navigation independently of saving a house.

The user must be able to dismiss a scan without saving anything.

The same recipient and house must support multiple different Tracking numbers and multiple parcels per day.

The Settings Center must allow the user to configure and test AI providers without editing source code.

Do not stop after planning. Do not stop after creating the UI. Do not stop after implementing only the AI API. Complete all phases, integrate them into the existing application, test the workflow, preserve existing functionality, and provide an honest completion report.