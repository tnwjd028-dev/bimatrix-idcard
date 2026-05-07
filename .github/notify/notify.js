const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  })
});

const db = getFirestore();

async function sendEmail(templateParams) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      template_params: templateParams,
    })
  });
  return res.ok;
}

function fmt(d) {
  if (!d || d === 'unlimited') return '무제한';
  return new Date(d).toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit' });
}

async function main() {
  const snap = await db.collection('tempid').doc('main').get();
  if (!snap.exists) { console.log('데이터 없음'); return; }

  const raw = snap.data();
  const STORAGE_KEY = 'bimatrix-tempid-v10';
  const stored = raw[STORAGE_KEY];
  if (!stored) { console.log('저장 데이터 없음'); return; }

  const data = JSON.parse(stored);
  const cards = data.cards || [];

  const today = new Date();
  today.setHours(0,0,0,0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dueToday = cards.filter(c =>
    c.status === 'rented' &&
    c.dueDate &&
    c.dueDate !== 'unlimited' &&
    c.holderEmail &&
    new Date(c.dueDate) >= today &&
    new Date(c.dueDate) < tomorrow
  );

  console.log(`반납기한 당일 카드: ${dueToday.length}건`);

  let sent = 0, failed = 0;
  for (const card of dueToday) {
    const ok = await sendEmail({
      to_name: card.holder || '',
      position: card.holderPosition || '',
      email: card.holderEmail,
      card_id: card.id,
      type: '반납 기한 당일 알림',
      message: `임시 사원증(${card.id}) 반납 기한이 오늘(${fmt(card.dueDate)})입니다.\n즉시 인사기획팀에 반납해 주시기 바랍니다.\n\n반납 시 사원증 QR코드를 스캔하여 반납 신청 후 실물을 제출해 주세요.`,
      due_date: fmt(card.dueDate),
      lost_date: '',
    });
    if (ok) {
      console.log(`✅ 발송 성공: ${card.id} → ${card.holderEmail}`);
      sent++;
    } else {
      console.log(`❌ 발송 실패: ${card.id}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`완료: 성공 ${sent}건, 실패 ${failed}건`);
}

main().catch(console.error);
