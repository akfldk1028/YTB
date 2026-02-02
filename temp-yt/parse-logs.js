const logs = JSON.parse(require('fs').readFileSync('D:/Data/00_Personal/YTB/temp-yt/logs.json', 'utf8'));
logs.reverse();
for (const l of logs) {
  const jp = l.jsonPayload || {};
  const ts = (l.timestamp || '').substring(11, 19);
  const msg = jp.msg || '';
  let extra = '';
  if (jp.progress) extra += ' [' + jp.progress + '] ' + (jp.step || '');
  if (jp.scene != null) extra += ' scene=' + jp.scene;
  if (jp.ttsDuration) extra += ' dur=' + Number(jp.ttsDuration).toFixed(1) + 's';
  if (jp.videoPath) extra += ' path=' + jp.videoPath;
  if (jp.gcsPath) extra += ' gcs=' + jp.gcsPath;
  if (jp.publicUrl) extra += ' url=' + jp.publicUrl;
  if (jp.error) extra += ' ERROR=' + JSON.stringify(jp.error);
  if (jp.channelName) extra += ' ch=' + jp.channelName;
  console.log(ts + ' ' + msg + extra);
}
