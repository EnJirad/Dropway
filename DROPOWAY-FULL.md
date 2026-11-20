DROPOWAY — FULL SMART PARCEL SCANNING, OCR, DAILY DELIVERY & MAP SYSTEM

Complete End-to-End Implementation (Parts 1–4)

You are the lead engineer responsible for implementing a complete, production-ready Smart Parcel Scanning and Delivery Management upgrade for Dropway.

Repository:
https://github.com/EnJirad/Dropway.git

Your mission is to thoroughly inspect the existing project, understand its architecture, and implement ALL parts of this upgrade in the existing application.

This is an implementation task, not a planning-only task. Do not stop after auditing, proposing architecture, writing TODOs, or creating a checklist. You must implement, integrate, verify, and complete all feasible work.

---

0. NON-NEGOTIABLE RULES

Repository safety

1. Fetch and inspect the latest "main" branch and commit SHA before starting.
2. Read the repository's AI instructions, documentation, ".ai/" files, and relevant handoff documents before modifying code.
3. Follow the repository's existing conventions, architecture, coding standards, and deployment workflow.
4. Inspect the working tree before making changes.
5. Never overwrite, discard, revert, or remove existing user changes.
6. Do not use destructive Git commands.
7. Do not create a second house database, duplicate delivery system, duplicate navigation system, or unnecessary parallel architecture.
8. Reuse existing services, components, APIs, database structures, and matching logic wherever practical.
9. Do not use mock data, fabricated success responses, fake OCR results, or hardcoded production data.
10. Do not expose API keys, secrets, recipient personal information, or sensitive scan images in logs.
11. Do not stop at a checklist. Continue implementing all phases sequentially.
12. If a feature is blocked, continue with all other feasible work and clearly document the blocker.
13. Do not break existing production functionality to accommodate this upgrade.
14. Avoid unnecessary dependencies, excessive bundle sizes, and architectural complexity.
15. Keep the application optimized for mobile browsers and real-world delivery work.

Build and deployment rules

- Follow the repository's existing build and deployment rules.
- Do not run local builds or deployments if the repository's instructions prohibit them.
- If CI/CD is the designated build system, push changes through the approved Git workflow and allow CI/CD to perform builds.
- Inspect deployment/build logs when available.
- Do not claim that a build, deployment, test, or integration succeeded unless it has actually been verified.
- Do not create commits or push changes unless permitted by the repository's instructions and current workflow.

---

1. OVERALL OBJECTIVE

Transform Dropway's existing scanning and delivery workflow into a fast, accurate, mobile-first parcel processing system capable of handling approximately 100–250 parcels per working day.

The desired workflow is:

Camera / Image Capture
→ Image Enhancement
→ Barcode / Tracking Detection
→ Thai & English OCR
→ Structured Field Extraction
→ House Matching
→ Scan Result Verification
→ Add Parcel to Today's Delivery
→ Map / Navigation

The system must support multiple parcels belonging to the same recipient and the same house.

Tracking numbers are unique to individual parcels, NOT to houses or recipients.

A recipient can receive multiple parcels in one day. Every parcel must be independently represented in today's delivery records.

---

2. PHASE 0 — COMPLETE EXISTING SYSTEM AUDIT

Before implementation:

- Inspect the entire repository structure.
- Read the applicable project instructions.
- Inspect existing scan pages and components.
- Inspect camera implementation.
- Inspect QR and barcode scanning libraries.
- Inspect OCR implementation.
- Inspect house matching algorithms.
- Inspect the house catalog.
- Inspect delivery queues.
- Inspect navigation logic.
- Inspect map integration.
- Inspect GPS and geolocation permissions.
- Inspect database schema and migrations.
- Inspect APIs and server actions.
- Inspect existing image processing.
- Inspect daily delivery records and status transitions.
- Inspect authentication and authorization.
- Inspect existing mobile layouts.

Trace the complete data flow from image capture to database persistence and navigation.

Identify:

- Existing functionality to preserve.
- Existing code to reuse.
- Weak or inaccurate OCR behavior.
- Duplicate prevention logic that incorrectly rejects parcels.
- House matching limitations.
- Tracking number storage problems.
- Missing or incorrect daily delivery relationships.
- UI problems.
- API problems.
- Database problems.
- Performance bottlenecks.
- Security and privacy risks.

Create an implementation checklist for all phases and update it as work progresses.

Do not stop after the audit. Proceed immediately with implementation.

---

3. PHASE 1 — SMART SCAN CORE

3.1 Scan Center

Create or improve the existing scanning interface into a unified Scan Center.

It must support clearly separated scanning modes:

1. Quick Scan — one parcel at a time.
2. Batch Scan — multiple parcels in one session.
3. Cover / Table Scan — fast multi-parcel processing and editable results.

Do not unnecessarily complicate the interface.

Requirements:

- Mobile-first design.
- Fast access to camera.
- Clear scanning feedback.
- Minimal taps.
- One-handed usability.
- Responsive layout.
- No horizontal overflow.
- Proper loading, error, success, and empty states.
- Real functionality for every button.
- Camera permission handling.
- Camera failure fallback.
- Gallery/image upload support.
- Rescan support.

Reuse existing scan components whenever possible.

---

3.2 Camera Capture and Label Image Processing

Improve the quality of images before OCR.

Implement suitable image preprocessing capabilities where practical:

- Image resizing with appropriate resolution limits.
- Rotation correction.
- Perspective correction when feasible.
- Brightness adjustment.
- Contrast enhancement.
- Noise reduction.
- Sharpening.
- Grayscale conversion.
- Thresholding.
- Label cropping.
- Region selection when necessary.

Do not apply aggressive transformations that destroy small Thai characters, phone digits, house numbers, or barcode details.

Provide an optional manual crop/adjustment workflow for difficult labels.

The scanner should work with:

- Slightly rotated labels.
- Low-light images.
- Shadows.
- Wrinkled labels.
- Small printed text.
- Different label layouts.
- Labels photographed at an angle.

---

3.3 Barcode and Tracking Recognition

Tracking numbers must be detected independently from OCR whenever possible.

Audit the existing barcode scanner and improve it as necessary.

Support common barcode formats found on parcel labels, including appropriate formats such as:

- Code 128
- Code 39
- EAN formats
- QR codes
- Other formats supported by the existing scanner and delivery labels

Requirements:

- Scan barcodes from the camera.
- Scan barcodes from captured images where supported.
- Support multiple barcode detection attempts.
- Validate extracted values.
- Preserve leading zeros.
- Avoid altering tracking numbers.
- Do not confuse phone numbers with tracking numbers.
- Do not fabricate tracking numbers if the barcode cannot be read.
- Allow manual tracking entry.
- Tracking must be optional.

Use barcode recognition as the primary Tracking extraction source when reliable barcode data is available.

OCR should be used to recover Tracking only when barcode detection fails or the label has no readable barcode.

---

3.4 Thai and English OCR Engine Evaluation

Investigate the best practical OCR engine for this project.

Evaluate the following technologies:

Existing Tesseract.js

Reuse the current implementation where appropriate.

Investigate:

- Thai language model support.
- English recognition.
- Numeric recognition.
- Recognition speed on mobile.
- Accuracy on actual parcel labels.
- Memory usage.
- Worker lifecycle and cleanup.
- Image preprocessing compatibility.

PaddleOCR Thai

Investigate the feasibility of using PaddleOCR with an appropriate Thai recognition model, including PP-OCRv5 Thai models where applicable.

Do not assume a Python OCR model can be used directly in the browser.

Evaluate practical integration options:

- Browser-compatible inference.
- WebAssembly.
- ONNX Runtime Web, if the model is compatible.
- A lightweight self-hosted OCR service.
- A separate OCR worker.
- Existing backend infrastructure.

Prefer the approach that provides the best combination of:

- Accuracy.
- Mobile performance.
- Maintainability.
- Low cost.
- Privacy.
- Minimal infrastructure.
- Practical deployment compatibility.

Do not add a heavyweight OCR engine without proving that it can be deployed and used successfully in this project.

OCR engine architecture

Implement a modular OCR interface so engines can be switched or extended without rewriting the scanning workflow.

Use a clean abstraction similar to:

- "OCRProvider"
- "OCRResult"
- "OCRTextBlock"
- "OCRConfidence"
- "OCRProcessor"
- "ImagePreprocessor"

Adapt naming to the existing architecture.

The system must support engine selection, fallback, and future upgrades.

---

3.5 OCR Confidence and Validation

Do not treat OCR confidence as proof that extracted information is correct.

Provide field-level confidence where the engine supports it.

Fields:

- Recipient name.
- Phone number.
- House number.
- Address.
- Tracking number.

Validate extracted data using multiple signals.

Examples:

- Phone format validation.
- Tracking pattern validation where appropriate.
- House-number format validation.
- Thai text normalization.
- Address component recognition.
- Barcode/OCR consistency.
- Existing house database matches.

Do not invent missing data.

Do not silently correct ambiguous characters unless the correction is supported by evidence.

Preserve the raw OCR text for troubleshooting and allow users to correct the extracted fields before confirming.

---

3.6 Structured Label Extraction

Extract the following information:

- Recipient name.
- Phone number.
- House number.
- Address.
- Subdistrict.
- District.
- Province.
- Postal code.
- Tracking number.
- Barcode contents.
- Raw OCR text.

Fields may be missing.

Use a structured schema with optional values.

If the label contains multiple phone numbers or multiple possible names, identify ambiguity rather than selecting an incorrect value automatically.

Implement a parser capable of handling varying label layouts.

Do not assume every courier uses the same label template.

---

4. PHASE 2 — HOUSE MATCHING ENGINE

4.1 House Matching Must Not Depend on Tracking

Tracking numbers must never be the primary identifier for recipient houses.

House matching should primarily use:

1. Exact normalized recipient name.
2. Exact phone number.
3. House number.
4. Address components.
5. Existing stored recipient/house relationships.
6. Fuzzy name matching as a supporting signal.

Tracking numbers identify parcels, not houses.

Do not store parcel tracking numbers permanently in the House record.

Do not use Tracking as the sole house lookup mechanism.

---

4.2 Thai Text Normalization

Implement careful normalization for Thai names and addresses.

Consider:

- Leading/trailing whitespace.
- Multiple spaces.
- Unicode normalization.
- Punctuation.
- Common formatting differences.
- Phone number formatting.
- House number formatting.
- OCR character confusion.

Do not remove or modify meaningful Thai characters.

Do not use overly aggressive normalization that causes different recipients to become indistinguishable.

---

4.3 Matching Score and Confidence

Develop a transparent scoring system using the existing matching architecture.

Example signal weights may be adjusted based on actual testing:

- Exact phone match: very strong.
- Exact house number: strong.
- Exact normalized name: strong.
- Address similarity: strong supporting evidence.
- Fuzzy name similarity: supporting evidence only.
- Existing known relationship: strong evidence.

Do not treat this example as an inflexible formula. Determine appropriate thresholds using the existing implementation and practical validation.

Matching results must be categorized:

- High-confidence match.
- Probable match.
- Multiple candidates.
- No match.
- Insufficient information.

The system must explain why a house was matched.

Examples:

- Name matches.
- Phone matches.
- House number matches.
- Address matches.
- Conflicting phone numbers.
- Multiple houses share a similar name.

Do not automatically select a house when confidence is insufficient or when important fields conflict.

---

4.4 Matching UI

Display candidate houses in a clear mobile-friendly interface.

Each candidate should show, when available:

- Recipient name.
- House number.
- Phone number.
- Address.
- Location availability.
- Match confidence.
- Match reasons.

Allow the user to manually select the correct house.

Never force the user to create a new house when an existing house can be selected.

---

5. PHASE 3 — DAILY PARCEL & NAVIGATION SYSTEM

CRITICAL BUSINESS RULE

One house can receive multiple parcels on the same day.

The same recipient may have:

- Two parcels.
- Three parcels.
- Many parcels.
- Different Tracking numbers.
- One parcel without a Tracking number.

This is normal.

The system must never reject a new parcel merely because the recipient or house already exists in today's navigation list.

5.1 Separate House and Parcel Entities

Keep the house catalog and daily parcel records conceptually and structurally separate.

House

Represents a permanent delivery destination.

Contains information such as:

- House ID.
- House number.
- Recipient name.
- Phone number.
- Address.
- Latitude.
- Longitude.
- Permanent house-related information.

Do not place daily parcel Tracking numbers in the permanent House record.

Daily Delivery / Navigation

Represents delivery work for a particular day.

Contains:

- Delivery date.
- Navigation session or route.
- Delivery status.
- Destination information.
- Parcel relationships.

Delivery Item / Parcel

Represents an individual physical parcel.

Contains:

- Parcel ID.
- Delivery session ID.
- House ID, optional.
- Recipient name.
- Phone number, optional.
- House number, optional.
- Address.
- Tracking number, optional.
- Scan timestamp.
- Delivery status.
- Source scan information where appropriate.

Adapt the architecture to the existing database rather than creating duplicate tables unnecessarily.

---

5.2 Tracking Number Rules

Implement the following rules:

1. Tracking is optional.
2. Tracking belongs to an individual parcel.
3. Tracking must not be permanently stored in the House record.
4. Multiple parcels can belong to the same house on the same day.
5. A new Tracking number for the same recipient is a new parcel.
6. Different Tracking numbers must not be rejected merely because the recipient is already in today's navigation.
7. A parcel with no Tracking number can still be added to navigation.
8. Duplicate detection must distinguish a duplicate scan from a separate parcel.
9. Do not use recipient name or House ID alone as a duplicate prevention key.
10. When a Tracking number exists, use it as a duplicate signal within the appropriate delivery date/session and enforce consistency with existing persistence rules.
11. When Tracking is absent, allow the user to add a parcel; avoid falsely declaring it a duplicate based only on the recipient's name.
12. Preserve parcel history for past delivery days where the existing architecture supports historical records.

---

5.3 Same House, Multiple Parcels

Implement this scenario correctly:

A user scans a parcel for House A.

Parcel 1:

- Recipient: Same Person
- House: House A
- Tracking: TRACK-001

Parcel 2:

- Recipient: Same Person
- House: House A
- Tracking: TRACK-002

Parcel 3:

- Recipient: Same Person
- House: House A
- Tracking: TRACK-003

Expected result:

- One house.
- One destination on today's navigation, unless the current navigation architecture intentionally represents parcels separately.
- Three independent parcel records.
- Three different Tracking numbers.
- A parcel count of 3.
- All three parcels visible in the destination's delivery details.
- No false duplicate warning.
- The route must not contain unnecessary duplicate stops for the same destination.

If the same parcel is scanned again with the same Tracking number in today's session, detect and warn that it is already recorded.

Allow appropriate recovery actions if the duplicate detection is uncertain.

---

5.4 Navigation Data Model and UI

The navigation list should represent destination stops efficiently.

A house can appear once as a stop while containing multiple parcels.

Show:

- Recipient.
- House number.
- Address.
- Parcel count.
- Tracking numbers associated with parcels.
- Delivery status.
- Location availability.
- Navigation controls.

Example:

House A — Recipient

- Parcel 1 — TRACK-001
- Parcel 2 — TRACK-002
- Parcel 3 — TRACK-003

3 parcels, 1 delivery destination.

Provide an expandable parcel list per destination.

Ensure adding another parcel to an existing destination updates the parcel count and details without duplicating the route stop.

Do not break existing navigation ordering, completion states, route calculations, or delivery history.

---

6. PHASE 4 — QUICK SCAN RESULT WORKFLOW

After every scan, present the appropriate result immediately.

6.1 High-Confidence House Match

Display:

- Scanned image or image preview.
- Recipient name.
- Phone number.
- House number.
- Address.
- Tracking number.
- OCR confidence.
- Matched house.
- Match explanation.
- Location status.
- Existing parcel count for today, if applicable.

Primary action:

Add to Today's Navigation

The action must:

- Create an individual Parcel record.
- Associate it with the matched House where appropriate.
- Preserve the scanned Tracking number on the Parcel record.
- Reuse the existing navigation stop if the house already exists in today's route.
- Increment the parcel count.
- Avoid duplicate route destinations.
- Detect duplicate Tracking numbers.
- Allow parcels with no Tracking number.

Do not require a new House record for an existing matched house.

---

6.2 Existing Recipient Already in Today's Navigation

If the recipient or house is already present in today's navigation:

- Show that the house is already scheduled for today.
- Show the current parcel count.
- Show today's existing Tracking numbers.
- Compare the new Tracking number with today's parcels.
- If the new Tracking number is different, allow adding it as another parcel.
- If the Tracking number is identical, warn that it may be a duplicate.
- Do not reject a parcel simply because the recipient is already in today's route.

Example:

Today's existing delivery:

- House 55/2
- 2 parcels
- TRACK-001
- TRACK-002

New scan:

- House 55/2
- TRACK-003

Expected:

- Show 2 existing parcels.
- Identify TRACK-003 as a new parcel.
- Allow adding.
- Result: 3 parcels, 1 destination.

---

6.3 No House Match

When no existing house matches:

Show all extracted fields in an editable form.

Provide two independent primary actions:

Action A — Add New House

Creates a permanent House record using verified information.

Requirements:

- Allow editing before saving.
- Do not require a Tracking number.
- Do not invent missing data.
- Do not invent GPS coordinates.
- Check for possible duplicate houses before creating.
- Allow selecting an existing candidate if one is discovered.
- Handle database errors honestly.

After creating the house, allow adding the scanned parcel to today's navigation.

Action B — Add to Today's Navigation

Adds the parcel to today's delivery session WITHOUT requiring the creation of a permanent House record.

Requirements:

- House ID can be null where the existing schema permits.
- Save recipient and destination information on the daily delivery record as necessary.
- Tracking is optional.
- Do not block the action because no permanent house exists.
- The parcel must appear in today's navigation.
- The user must be able to locate or navigate to it later when coordinates become available.

The two actions must be independent.

The user must be able to add a parcel to today's navigation without first creating a house.

---

6.4 House Exists but Has No Coordinates

When a matched house has no GPS coordinates:

- Do not block adding the parcel to today's delivery.
- Clearly indicate that the house location is missing.
- Offer a Map Picker action.
- Allow the user to add coordinates later.
- Allow navigation using available address information where supported.
- Never fabricate latitude or longitude.

---

6.5 Multiple Candidate Houses

When matching is ambiguous:

- Display candidate houses.
- Show matching reasons.
- Show conflicting information.
- Allow manual selection.
- Allow searching the house catalog.
- Allow adding a new house only after checking for potential duplicates.
- Never silently assign a parcel to a wrong house.

---

7. PHASE 5 — BATCH SCAN / COVER / TABLE SCAN

Implement a complete multi-parcel scanning workflow.

7.1 Batch Capture

Support:

- Consecutive camera capture.
- Gallery multi-selection.
- Multiple parcel images.
- Session-based processing.
- Controlled concurrency.
- Queue management.
- Progress indicators.
- Retry for failed images.

Do not process hundreds of high-resolution images simultaneously in memory.

Implement resource-aware processing.

---

7.2 Batch OCR

For each image independently:

1. Prepare image.
2. Detect barcode.
3. Perform OCR.
4. Extract fields.
5. Validate fields.
6. Match house.
7. Detect duplicate parcel candidates.
8. Produce structured results.

One image's failure must not stop the entire batch.

---

7.3 Batch Results Table

Create a mobile-friendly editable results table or responsive cards.

Columns/fields:

- Selection.
- Recipient.
- Phone.
- House number.
- Address.
- Tracking.
- House match.
- Confidence.
- Status.

Support:

- Editing extracted information.
- Selecting and deselecting rows.
- Filtering by matched/unmatched.
- Filtering by low confidence.
- Filtering by duplicates.
- Retry OCR.
- Manual house selection.
- Removing a scan from the batch.
- Adding selected parcels to today's navigation.
- Creating houses where appropriate.
- Adding unmatched parcels without creating houses.

The user must be able to process a large batch efficiently without opening every record individually.

---

7.4 Batch Duplicate Handling

Duplicate detection must be based on parcel identity, not recipient identity.

- Same recipient + different Tracking = normally separate parcels.
- Same house + different Tracking = normally separate parcels.
- Same Tracking + same delivery session = likely duplicate scan.
- Missing Tracking = do not automatically reject because of recipient name.
- Ambiguous cases = show a warning and allow manual resolution.

Never silently delete a scanned parcel from the batch.

---

8. PHASE 6 — MAP PICKER

Implement a practical interactive Map Picker for houses without coordinates.

Prefer evaluating Leaflet with OpenStreetMap-compatible tiles if it fits the existing architecture and licensing constraints.

Requirements:

- Mobile-first full-screen map.
- Search location/address where supported.
- GPS current-location button.
- Location permission handling.
- Tap-to-place marker.
- Drag marker.
- Confirm location.
- Display latitude and longitude.
- Reverse geocoding where supported.
- Save coordinates to the existing House record.
- Cancel without saving.
- Handle loading and network errors.
- Clearly distinguish approximate geocoding from exact user-selected GPS locations.
- Do not invent coordinates.
- Avoid paid services without documenting costs.
- Protect API keys and credentials.
- Avoid exposing unnecessary personal recipient information.

If Google Maps integration already exists, preserve compatibility with existing Google Maps navigation links.

---

9. PHASE 7 — INTERACTIVE DROPWAY MAP

Implement or upgrade the map for delivery operations.

Requirements:

- Display houses with valid coordinates.
- Display today's delivery destinations.
- Show markers with appropriate status indicators.
- Show selected house details.
- Show parcel count per destination.
- Show Tracking numbers in expandable details.
- Highlight selected destinations.
- Support marker selection.
- Support house search.
- Support nearby houses.
- Show current GPS location where permission is granted.
- Support opening navigation.
- Support route visualization and route ordering when existing services allow.
- Allow houses without coordinates to be identified and located.
- Handle overlapping markers and nearby houses.
- Integrate with the existing route and navigation system.
- Avoid creating a second navigation architecture.

The map must be usable on mobile and must not interfere with the existing delivery workflow.

---

10. PHASE 8 — AI VISION FALLBACK (OPTIONAL AND CONTROLLED)

Evaluate the use of Gemini Flash-Lite or an appropriate current Gemini model for difficult parcel labels.

Do not make AI Vision the primary scanning engine.

The preferred default architecture is:

Barcode
→ Local OCR
→ Field Parsing
→ Validation
→ House Matching

AI Vision is an optional fallback only when:

- Local OCR cannot confidently read required fields.
- The label layout is unusual.
- Fields are ambiguous.
- The user explicitly requests enhanced recognition.

AI requirements

- Verify current model availability and API limits before selecting a model.
- Do not assume a Free Tier can support unlimited daily image processing.
- Do not assume the Free Tier is permanent.
- Do not make the system dependent on a specific AI provider.
- Implement a provider abstraction if AI integration is justified.
- Support disabling AI completely.
- Support request throttling.
- Support rate limits.
- Support failure handling.
- Support timeout handling.
- Support usage monitoring.
- Never allow API keys in client-side code.
- Call AI through a secure backend.
- Do not log label images or personal recipient information.
- Avoid sending real parcel images to AI services unless the integration is explicitly configured and its privacy implications are understood.
- Do not send every parcel to AI.
- Never let AI invent Tracking numbers, names, phone numbers, house numbers, or GPS coordinates.

AI must return structured output with optional fields and uncertainty.

Treat AI output as untrusted data and validate it before use.

If AI is unavailable, the scanning system must continue working with local OCR and barcode recognition.

---

11. PHASE 9 — PERFORMANCE FOR 100–250 PARCELS DAILY

Optimize for realistic daily workload.

Requirements:

- Efficient camera workflow.
- Fast barcode decoding.
- Resource-aware OCR.
- Lazy-load OCR engines.
- Reuse OCR workers appropriately.
- Clean up workers and camera resources.
- Avoid unnecessary image copies.
- Limit processing concurrency.
- Avoid excessive memory usage.
- Avoid excessive API calls.
- Avoid loading heavyweight AI models on initial page load.
- Prevent repeated initialization.
- Handle camera switching.
- Provide retry without restarting the whole app.

Measure and report performance where feasible:

- Capture-to-barcode time.
- Capture-to-OCR time.
- Field extraction time.
- House matching time.
- Total scan-to-result time.
- Batch processing throughput.
- Memory/bundle impact where measurable.

Do not claim performance improvements without measurements.

---

12. PHASE 10 — DATABASE, API, AND MIGRATION SAFETY

Inspect all existing database tables, constraints, relationships, APIs, and migrations before making schema changes.

Requirements:

- Reuse existing tables where possible.
- Keep the permanent House Catalog separate from individual Parcel records.
- Keep Tracking on Parcel records, not House records.
- Support multiple parcels for the same House on the same day.
- Support parcels without Tracking.
- Support parcels without a permanent House ID where the existing architecture can safely accommodate it.
- Support historical daily delivery records.
- Prevent duplicate Tracking records within the correct delivery scope.
- Avoid global uniqueness constraints that incorrectly prevent legitimate Tracking reuse outside the intended scope.
- Preserve existing IDs and relationships.
- Preserve route status.
- Preserve delivery status.
- Preserve existing navigation behavior.
- Provide safe database migrations when necessary.
- Migrations must be reversible or include a safe recovery strategy.
- Do not delete historical records.
- Do not migrate old Tracking data into permanent House records.
- Avoid unnecessary database writes during scanning.
- Handle transaction failures correctly.
- Ensure API authorization and ownership checks remain intact.

If schema changes are required:

1. Document why.
2. Design the migration.
3. Check backward compatibility.
4. Preserve existing data.
5. Add appropriate indexes.
6. Add constraints only when they are correct for real delivery operations.
7. Test migration behavior using the project's approved workflow.

---

13. PHASE 11 — UX AND DESIGN QUALITY

Maintain Dropway's existing design language while making scanning faster and easier.

Design principles:

- Clean.
- Professional.
- Minimal.
- Mobile-first.
- Fast.
- Easy to use in bright outdoor environments.
- Clear status colors.
- Large touch targets.
- Minimal unnecessary dialogs.
- Clear distinction between permanent houses and daily parcels.

Use existing UI libraries and design components where practical.

Do not redesign unrelated pages.

Ensure:

- Buttons are functional.
- Loading states are accurate.
- Error states are useful.
- Empty states are informative.
- Forms are editable.
- Modals fit the mobile viewport.
- Keyboard does not obscure critical actions.
- No content overflows horizontally.
- No fake success notifications.

---

14. PHASE 12 — TESTING AND VALIDATION

Perform comprehensive testing using the existing test framework and project workflow.

OCR tests

Test:

- Thai names.
- English names.
- Mixed Thai and English.
- Phone numbers.
- House numbers.
- Tracking numbers.
- Missing fields.
- Rotated images.
- Low-light images.
- Blurry images.
- Cropped labels.
- Multi-line addresses.
- Labels with different courier layouts.

House matching tests

Test:

- Exact name match.
- Exact phone match.
- Exact house number match.
- Exact address match.
- Name variation.
- OCR mistakes.
- Similar recipient names.
- Multiple candidates.
- Conflicting phone numbers.
- No match.
- Missing data.
- Incorrect house number.

Daily parcel tests

Test:

- First parcel for a house.
- Second parcel for the same recipient with a different Tracking number.
- Third parcel for the same recipient.
- Same house with several parcels.
- Same Tracking scanned twice.
- Different Tracking numbers for the same house.
- No Tracking number.
- Unmatched house.
- House without GPS.
- Parcel added without permanent House ID.
- Adding a house and then a parcel.
- Adding a parcel to an existing navigation stop.
- Route stop deduplication.
- Parcel count accuracy.
- Daily delivery status.
- Historical delivery data integrity.

Batch scan tests

Test:

- Multiple images.
- Partial OCR failure.
- Barcode failure.
- Duplicate scans.
- Low-confidence scans.
- Unmatched parcels.
- User edits.
- Selected rows only.
- Large batches.
- Processing cancellation and retry.

Map tests

Test:

- GPS permission granted.
- GPS permission denied.
- Search.
- Marker placement.
- Marker dragging.
- Coordinate saving.
- Missing coordinates.
- Existing coordinates.
- Map network failure.
- Navigation links.
- Mobile layout.

Regression tests

Ensure existing features remain functional:

- House catalog.
- House search.
- Navigation.
- Route ordering.
- Delivery statuses.
- GPS.
- QR/barcode scanning.
- Existing API endpoints.
- Authentication.
- Database compatibility.
- Mobile responsiveness.

Do not stop when one test fails. Diagnose and fix regressions introduced by your changes.

---

15. IMPLEMENTATION WORKFLOW

Execute the work in the following sequence:

Step 1 — Audit

Inspect repository and instructions.

Step 2 — Checklist

Create a comprehensive checklist of all phases and sub-tasks.

Step 3 — Architecture

Choose the best implementation approach using existing architecture.

Step 4 — Implement Smart Scan Core

Camera, image preprocessing, barcode, OCR, structured extraction, confidence, and validation.

Step 5 — Implement House Matching

Improve matching, candidate selection, and match explanations.

Step 6 — Implement Daily Parcel System

Correctly separate houses from individual parcels and Tracking records.

Step 7 — Implement Quick Scan Result UI

Add correct match/no-match/ambiguous workflows and both actions for unmatched houses.

Step 8 — Implement Batch Scan

Capture, process, edit, select, and add parcels efficiently.

Step 9 — Implement Map Picker

Allow locating and saving house coordinates.

Step 10 — Implement Interactive Map

Integrate map functionality with today's delivery and existing navigation.

Step 11 — Evaluate and Integrate AI Fallback

Implement only if justified, safely configured, and compatible with the project.

Step 12 — Testing

Run all permitted tests and validations.

Step 13 — Regression Review

Review all modified files and confirm existing functionality has not been unnecessarily affected.

Step 14 — Documentation

Update relevant project documentation and AI handoff instructions.

Update the implementation checklist with real completion status.

---

16. COMPLETION CRITERIA

The task is not complete until all feasible parts have been implemented and integrated.

The final system should be capable of:

- Scanning a parcel label from a mobile camera.
- Reading barcodes and Tracking numbers.
- Reading Thai and English label text.
- Extracting recipient information.
- Extracting phone numbers.
- Extracting house numbers.
- Extracting addresses.
- Detecting uncertain OCR fields.
- Matching recipients to existing houses.
- Showing multiple matching houses when ambiguous.
- Adding a new house.
- Adding a parcel to today's navigation without creating a permanent house.
- Adding multiple parcels to the same house.
- Storing Tracking per parcel.
- Allowing parcels without Tracking.
- Detecting actual duplicate parcel scans.
- Avoiding duplicate route stops for the same destination.
- Showing parcel counts.
- Performing batch scanning.
- Editing batch results.
- Selecting and adding multiple parcels.
- Locating homes using an interactive map.
- Saving missing GPS coordinates.
- Showing delivery destinations on a map.
- Opening navigation.
- Working without AI Vision when the AI service is unavailable.

---

17. FINAL REPORT

After completing the implementation, provide a detailed but concise report containing:

A. Implementation Summary

What was actually implemented in each phase.

B. Files Changed

List key modified and newly created files with a brief explanation.

C. Database Changes

Explain schema changes, migrations, constraints, and how Tracking is now handled.

D. OCR Engine

Explain which OCR engine is used, why it was selected, whether Thai recognition is supported, and any limitations.

E. Scanning Accuracy

Report actual test results if available. Clearly distinguish measured accuracy from estimates.

F. Daily Parcel Workflow

Explain how multiple parcels for the same recipient and house work.

G. Batch Scanning

Explain the completed workflow and limitations.

H. Map and GPS

Explain Map Picker, coordinate saving, map integration, and navigation.

I. AI Integration

Explain whether AI Vision was implemented, which model/provider is used, the configuration required, cost/limits, privacy safeguards, and fallback behavior.

J. Testing

List tests actually run and their real outcomes.

K. Deployment

Report whether changes were committed/pushed, CI/CD was triggered, and deployment/build status if verified.

L. Remaining Issues

List only genuine remaining blockers or unfinished tasks.

M. Checklist

Show a complete checklist of all phases with actual completion status.

---

FINAL DIRECTIVE

Work as an autonomous senior engineer.

Inspect first. Plan internally and maintain a checklist. Then implement all phases in order.

Do not ask me to approve every phase.

Do not stop after producing a plan.

Do not implement only the UI.

Do not create fake OCR or fake delivery data.

Do not replace existing functionality unnecessarily.

Do not use Tracking numbers as house identifiers.

Do not prevent multiple parcels from being added to the same house on the same day.

Do not require a permanent house record before adding a parcel to today's navigation.

Do not invent OCR results, GPS coordinates, successful tests, or deployment outcomes.

Complete all feasible implementation work, verify it, and report honestly.

The ultimate goal is a reliable, fast, mobile-first parcel scanning and delivery system that I can actually use every day to process 100–250 parcels, find the correct recipient and house, manage multiple parcels per destination, and navigate efficiently.