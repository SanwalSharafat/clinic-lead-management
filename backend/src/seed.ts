// ========================================
// Seed: clinic_config with realistic scoring rules
// Run with: npx ts-node src/seed.ts
// ========================================

import 'dotenv/config';
import { supabase } from './lib/supabase';

async function seed() {
  console.log('Seeding clinic_config...');

  // Deactivate any existing configs
  const { error: deactivateError } = await supabase
    .from('clinic_config')
    .update({ is_active: false })
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (deactivateError) {
    console.error('Error deactivating existing configs:', deactivateError.message);
    // Continue anyway — table might be empty
  }

  const configData = {
    version: 1,
    required_fields: [
      'reason_for_visit',
      'urgency',
      'preferred_doctor',
      'insurance',
      'new_or_returning',
    ],
    field_definitions: {
      reason_for_visit: {
        type: 'string',
        required: true,
        description:
          'The primary reason the patient is reaching out (e.g., cleaning, checkup, tooth pain, whitening, root canal, braces)',
      },
      urgency: {
        type: 'enum',
        required: true,
        enum_values: ['emergency', 'urgent', 'routine', 'cosmetic', 'consultation'],
        description: 'How urgent the patient considers their need',
      },
      preferred_doctor: {
        type: 'string',
        required: true,
        description: 'Whether the patient has a preferred doctor (name or "no preference")',
      },
      insurance: {
        type: 'string',
        required: true,
        description: 'Insurance provider name or "self-pay" or "none"',
      },
      new_or_returning: {
        type: 'enum',
        required: true,
        enum_values: ['new', 'returning'],
        description: 'Whether the patient is new to the clinic or returning',
      },
      name: { type: 'string', required: false, description: 'Patient full name' },
      email: { type: 'string', required: false, description: 'Patient email address' },
      preferred_date: { type: 'string', required: false, description: 'Preferred appointment date' },
      preferred_time: { type: 'string', required: false, description: 'Preferred appointment time' },
    },
    scoring_rules: [
      // Emergency/urgency signals
      { field: 'urgency', operator: 'equals', value: 'emergency', points: 40 },
      { field: 'urgency', operator: 'equals', value: 'urgent', points: 25 },

      // New patients are higher value (acquisition cost already spent via marketing)
      { field: 'new_or_returning', operator: 'equals', value: 'new', points: 15 },

      // Insurance = more likely to proceed with treatment
      { field: 'insurance', operator: 'exists', value: true, points: 10 },
      { field: 'insurance', operator: 'not_equals', value: 'none', points: 5 },
      { field: 'insurance', operator: 'not_equals', value: 'self-pay', points: 5 },

      // High-value services
      { field: 'reason_for_visit', operator: 'contains', value: 'implant', points: 20 },
      { field: 'reason_for_visit', operator: 'contains', value: 'veneer', points: 15 },
      { field: 'reason_for_visit', operator: 'contains', value: 'crown', points: 15 },
      { field: 'reason_for_visit', operator: 'contains', value: 'root canal', points: 15 },
      { field: 'reason_for_visit', operator: 'contains', value: 'invisalign', points: 15 },
      { field: 'reason_for_visit', operator: 'contains', value: 'whitening', points: 10 },
      { field: 'reason_for_visit', operator: 'contains', value: 'braces', points: 10 },
      { field: 'reason_for_visit', operator: 'contains', value: 'denture', points: 10 },
      { field: 'reason_for_visit', operator: 'contains', value: 'bridge', points: 10 },

      // Returning patients showing intent (lower but still valuable)
      { field: 'new_or_returning', operator: 'equals', value: 'returning', points: 5 },

      // Specific doctor preference = higher intent
      { field: 'preferred_doctor', operator: 'not_equals', value: 'no preference', points: 5 },
    ],
    thresholds: {
      high: 60,
      medium: 30,
    },
    is_active: true,
  };

  const { data, error } = await supabase
    .from('clinic_config')
    .insert([configData])
    .select()
    .single();

  if (error) {
    console.error('Error inserting clinic_config:', error.message);
    process.exit(1);
  }

  console.log('Clinic config seeded successfully!');
  console.log(`Config ID: ${data.id}`);
  console.log(`Scoring rules: ${configData.scoring_rules.length}`);
  console.log(`Thresholds: HIGH >= ${configData.thresholds.high}, MEDIUM >= ${configData.thresholds.medium}`);
  console.log('Done.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
