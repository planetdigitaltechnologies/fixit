/* IPRS (Integrated Population Registration Services) ID verification.
   This is a simulated check that mirrors the real IPRS API contract.
   To go live: replace the body of verifyID() with a real HTTP call to
   process.env.IPRS_API_URL using process.env.IPRS_API_KEY. */

const verifyID = async (idNumber, name) => {
  // Simulate network latency of a real government API call
  await new Promise(r => setTimeout(r, 800));

  const digitsOnly = (idNumber || '').replace(/\D/g, '');

  if (!digitsOnly || digitsOnly.length < 7 || digitsOnly.length > 8) {
    return { verified: false, reason: 'Invalid National ID format. Must be 7–8 digits.' };
  }

  // Real IPRS integration would look like:
  // const res = await fetch(process.env.IPRS_API_URL, {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${process.env.IPRS_API_KEY}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ id_number: digitsOnly, name }),
  // });
  // const data = await res.json();
  // return { verified: data.match === true, idNumber: digitsOnly, fullName: data.full_name, checkedAt: new Date() };

  return { verified: true, idNumber: digitsOnly, checkedAt: new Date() };
};

const verifyCertificate = async (certNumber, category) => {
  await new Promise(r => setTimeout(r, 400));
  const prefixes = { plumber: 'NCA', electrician: 'EBK', mechanic: 'NTSA' };
  const expected = prefixes[category];
  const valid = expected && certNumber?.toUpperCase().startsWith(expected);
  return {
    valid: !!valid,
    reason: valid ? null : `Certificate number should start with "${expected}" for ${category}s.`,
    certNumber, category, checkedAt: new Date(),
  };
};

module.exports = { verifyID, verifyCertificate };
