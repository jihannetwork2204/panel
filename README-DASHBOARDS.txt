Dashboard pages update

Student:
- Existing student tile dashboard is preserved.

Teacher:
- /teacher_portal opens as a tile-style Teacher Dashboard.
- Existing Upload Marks page remains and keeps Class / Room / Shift / Gender filtering.

Admin:
- /dashboard opens as a tile-style Admin Dashboard.
- Existing Admin Tools remain at /dashboard?view=tools.
- Dashboard tiles jump to Exam, Students, Teachers, Subjects, Fees, Notice and Branding sections.
- Existing data/portal-data.json and public/logo.png are preserved.

PM2:
pm2 restart jihan-portal
