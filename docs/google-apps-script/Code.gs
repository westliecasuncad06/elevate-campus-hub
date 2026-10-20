/**
 * Elevate Campus Hub — Google Apps Script webhook
 *
 * Deploy: Extensions > Apps Script > paste this file > Deploy > New deployment
 *         > type "Web app" > Execute as "Me" > Who has access "Anyone" > Deploy.
 * Copy the Web app URL into GOOGLE_APPS_SCRIPT_WEBHOOK_URL (.env.local and Vercel).
 *
 * The signed-in Google account that deploys it must be able to edit the target Google Doc.
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // The Google Form is submitted by the app itself, so this script only handles Google Docs.
    if (data.type === 'docs') {
      return handleDocAppend(data);
    }

    return json({ success: false, error: 'Unknown type' });
  } catch (err) {
    return json({ success: false, error: err.toString() });
  }
}

function handleDocAppend(payload) {
  var doc = DocumentApp.openById(payload.docId);
  var body = doc.getBody();

  body.appendParagraph("═════════════════════════════════════════════");
  body.appendParagraph("ELEVATE CAMPUS HUB — ATTENDANCE & MINISTRY REPORT");
  body.appendParagraph("Campus: " + (payload.campusName || "GRC"));
  body.appendParagraph("School/Location: " + (payload.location || payload.campusName || ""));
  body.appendParagraph("Date Range: " + payload.dateFrom + " to " + payload.dateTo);
  body.appendParagraph("Total Attendance: " + payload.totalAttendance);
  body.appendParagraph("Students Engaged: " + payload.studentsEngaged);
  body.appendParagraph("Gospel Heard: " + payload.studentsHeardGospel);
  body.appendParagraph("Accepted Jesus: " + payload.studentsAcceptedJesus);
  body.appendParagraph("Wants D-Group: " + payload.studentsWantsDgroup);
  body.appendParagraph("Active Volunteers: " + payload.volunteersCount);
  body.appendParagraph("Submitted By: " + payload.submittedBy);
  body.appendParagraph("Timestamp: " + new Date().toISOString());
  body.appendParagraph("═════════════════════════════════════════════\n");

  doc.saveAndClose();
  return json({ success: true });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
