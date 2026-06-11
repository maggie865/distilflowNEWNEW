import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const FILE_ID = '1NvJDaQo73FXSLrcFOO7tH_lnuUEAvn1i';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Try Sheets connector for the sheet access token
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // Try Drive API to get file metadata
    const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${FILE_ID}?fields=id,name,mimeType`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const driveMeta = await driveRes.json();

    return Response.json({ driveMeta, status: driveRes.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});