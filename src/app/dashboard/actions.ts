'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

// 1. SIGN WAIVER
export async function signWaiver(signatureDataUrl: string, participantId: string) {
  console.log("WAIVER DEBUG: Starting signWaiver for participant:", participantId)
  
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not logged in")

  console.log("WAIVER DEBUG: Fetching profile for auth:", user.id)
  const { data: profile, error: profErr } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single()
  if (profErr || !profile) {
    console.error("WAIVER DEBUG: Profile fetch error:", profErr)
    throw new Error("Profile not found")
  }
  console.log("WAIVER DEBUG: Parent profile:", profile.id)

  console.log("WAIVER DEBUG: Fetching template")
  const { data: template, error: tplErr } = await supabase.from('waiver_templates').select('id').eq('is_active', true).single()
  if (tplErr || !template) {
    console.error("WAIVER DEBUG: Template fetch error:", tplErr)
    throw new Error("No active waiver template found")
  }
  console.log("WAIVER DEBUG: Template found:", template.id)

  // Insert the waiver - assigning it to the participant, but signed by the logged-in parent
  console.log("WAIVER DEBUG: Inserting into waivers...")
  const { error, data } = await supabase.from('waivers').insert({
    participant_id: participantId,
    signed_by_id: profile.id,
    waiver_template_id: template.id,
    signature_svg: signatureDataUrl,
    is_valid: true
  }).select()

  if (error) {
    console.error("WAIVER DEBUG: Failed to save waiver in DB:", error)
    throw new Error("Failed to save waiver")
  }
  console.log("WAIVER DEBUG: Successfully inserted waiver:", data)

  revalidatePath('/dashboard')
}

// 2. ADD DEPENDENT TO HOUSEHOLD
export async function addDependent(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not logged in")

  const firstName = formData.get('firstName') as string
  const lastName = formData.get('lastName') as string
  const dob = formData.get('dob') as string

  // A single, atomic, transactional RPC call to Postgres!
  const { data: childId, error } = await supabase.rpc('add_dependent_to_household', {
    p_first_name: firstName,
    p_last_name: lastName,
    p_dob: dob
  })

  if (error) {
    console.error("RPC Transaction Failed:", error)
    throw new Error("Failed to add family member to the database.")
  }

  // Refresh page to trigger Gatekeeper!
  revalidatePath('/dashboard')
}
