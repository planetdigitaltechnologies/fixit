require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, pool } = require('./config/db');

const TECHS = [
  { name:'James Kariuki',  email:'james@fixit.demo',  phone:'+254711000001', cat:'plumber',     exp:8,  rate:1500, bio:'Master plumber, NCA registered. Pipe fitting, drainage & water systems.',    lat:-1.2881, lng:36.8199, cert:'NCA-PL-2847',  id:'28470192', rating:4.8, jobs:312 },
  { name:'Grace Wanjiku',  email:'grace@fixit.demo',  phone:'+254711000002', cat:'electrician', exp:6,  rate:1800, bio:'Licensed electrician EBK registered. Residential & commercial wiring.',     lat:-1.2965, lng:36.8172, cert:'EBK-2023-441', id:'31982045', rating:4.9, jobs:287 },
  { name:'Peter Ochieng',  email:'peter@fixit.demo',  phone:'+254711000003', cat:'mechanic',    exp:12, rate:2000, bio:'Auto electrician & mechanic. Roadside rescue & diagnostics specialist.',    lat:-1.3012, lng:36.8298, cert:'NTSA-M-9281', id:'19284057', rating:4.7, jobs:198 },
  { name:'Faith Muthoni',  email:'faith@fixit.demo',  phone:'+254711000004', cat:'plumber',     exp:4,  rate:1200, bio:'Pipe fitting, drainage & solar water heater installations.',               lat:-1.2788, lng:36.8341, cert:'NCA-PL-3912',  id:'40192834', rating:4.6, jobs:145 },
  { name:'David Njoroge',  email:'david@fixit.demo',  phone:'+254711000005', cat:'mechanic',    exp:9,  rate:1800, bio:'Toyota & Subaru specialist. Fast mobile response across Nairobi.',         lat:-1.3101, lng:36.8127, cert:'NTSA-M-7741', id:'22041983', rating:4.5, jobs:231 },
  { name:'Susan Achieng',  email:'susan@fixit.demo',  phone:'+254711000006', cat:'electrician', exp:7,  rate:2200, bio:'Solar panel installation & smart home automation expert.',                  lat:-1.2998, lng:36.8401, cert:'EBK-2022-318', id:'38920174', rating:4.3, jobs:89  },
  { name:'Ali Hassan',     email:'ali@fixit.demo',    phone:'+254711000007', cat:'plumber',     exp:15, rate:2500, bio:'30-year family business. Commercial & residential plumbing.',              lat:-1.2845, lng:36.8089, cert:'NCA-PL-1001',  id:'12983748', rating:5.0, jobs:521 },
  { name:'Mary Waweru',    email:'mary@fixit.demo',   phone:'+254711000008', cat:'mechanic',    exp:5,  rate:1600, bio:'Brake, suspension & tyre specialist. All car brands.',                    lat:-1.3055, lng:36.8267, cert:'NTSA-M-8832', id:'35817294', rating:4.4, jobs:112 },
  { name:'Kevin Mutua',    email:'kevin@fixit.demo',  phone:'+254711000009', cat:'electrician', exp:3,  rate:1400, bio:'KPLC-certified. Generator & inverter installations.',                     lat:-1.2720, lng:36.8350, cert:'EBK-2024-099', id:'43019284', rating:4.2, jobs:67  },
  { name:'Lilian Omondi',  email:'lilian@fixit.demo', phone:'+254711000010', cat:'plumber',     exp:6,  rate:1700, bio:'Borehole, swimming pool & domestic water systems. NCA certified.',        lat:-1.3200, lng:36.8450, cert:'NCA-PL-5521',  id:'27381920', rating:4.7, jobs:189 },
];

async function seed() {
  console.log('[Seed] Starting…');
  const hash = await bcrypt.hash('Demo@1234', 12);

  // Admin
  await query(`
    INSERT INTO users (name, email, phone, password_hash, role, avatar_initials)
    VALUES ('FixIt Admin','admin@fixit.ke','+254700000000',$1,'admin','FA')
    ON CONFLICT (email) DO NOTHING`, [hash]);
  console.log('[Seed] Admin user: admin@fixit.ke / Demo@1234');

  // Demo client
  await query(`
    INSERT INTO users (name, email, phone, password_hash, role, avatar_initials)
    VALUES ('Demo Client','client@fixit.demo','+254722000001',$1,'client','DC')
    ON CONFLICT (email) DO NOTHING`, [hash]);
  console.log('[Seed] Demo client: client@fixit.demo / Demo@1234');

  // Technicians
  for (const t of TECHS) {
    const initials = t.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    const { rows: uRows } = await query(`
      INSERT INTO users (name, email, phone, password_hash, role, avatar_initials)
      VALUES ($1,$2,$3,$4,'technician',$5)
      ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [t.name, t.email, t.phone, hash, initials]
    );
    const userId = uRows[0].id;
    await query(`
      INSERT INTO technicians
        (user_id, category, experience_yrs, hourly_rate, bio, current_lat, current_lng,
         id_number, cert_number, verify_status, is_online, is_available, rating, total_jobs,
         total_reviews, verified_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'verified',true,true,$10,$11,$12,NOW())
      ON CONFLICT (user_id) DO UPDATE
        SET rating=EXCLUDED.rating, total_jobs=EXCLUDED.total_jobs`,
      [userId, t.cat, t.exp, t.rate, t.bio, t.lat, t.lng,
       t.id, t.cert, t.rating, t.jobs, Math.round(t.jobs * 0.6)]
    );
    console.log(`[Seed] Technician: ${t.name} (${t.cat})`);
  }

  console.log('\n[Seed] ✓ Complete!\n');
  console.log('Demo credentials:');
  console.log('  Admin:       admin@fixit.ke      / Demo@1234');
  console.log('  Client:      client@fixit.demo   / Demo@1234');
  console.log('  Technician:  james@fixit.demo    / Demo@1234');
  await pool.end();
}

seed().catch(err => { console.error('[Seed] Failed:', err.message); process.exit(1); });
