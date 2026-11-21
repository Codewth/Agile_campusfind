# CampusFind v2 — testing and acceptance checklist

Run `npm run test:all` with Node 22.13+ for backend integration tests and matching logic. Install dependencies with `npm install` and run `npm run build` and `npm run test` for frontend and Vitest checks. A real local end-to-end browser run requires both Node backend and Vite frontend using `npm run dev:all`.

Manual integration walkthrough:

1. Visit `/api/health` on port 3001. Confirm JSON `{status:'ok', service:'CampusFind API'}`.
2. Open frontend port 5173. Create student A with a strong password (8+ chars), log out, and log in again. Restart server and verify session restoration.
3. Create a found report, attach a JPG/PNG/WebP under 5 MB, browse, search/filter and open its details. Reject a future incident date and invalid image.
4. Register student B in another browser profile. Attempt to modify student A's report from B (API must return 403). B should submit a private claim; A should view it in My Reports → Recovery requests. A accepts: report status becomes `claimed`.
5. B cannot create a duplicate claim or see unrelated private incoming requests. A can mark resolved, reopen, edit, and delete their own report.
6. B flags a report. Confirm flags are inaccessible to ordinary users. Promote a pre-registered admin via local CLI; log in and review `/admin`, hide/restore a listing and mark flags reviewed.
7. Restart backend. Confirm SQLite and photo files persist. Test deleting a report removes associated claim rows and the old photo.
8. Build once with `npm run build` and run `npm start` to confirm React and `/api` are served by the same process on port 3001.

Never use real personal contact details, student IDs, or passwords inside test report descriptions or claim notes. Confirm all campus staff verification and data retention procedures separately with stakeholders. Automatic email verification and external notifications are not implemented.
