import { supabase } from '../config/supabase.js';

export const scheduleService = {
  async getSchedules(userId) {
    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .eq('user_id', userId)
      .order('next_run_at', {
        ascending: true,
        nullsFirst: false
      });

    if (error) {
      throw error;
    }

    return data;
  },

  async createSchedule(userId, scheduleData) {
    const {
      job_type,
      status,
      schedule_expression,
      timezone,
      config,
      scheduled_for,
      next_run_at,
      schedule_type
    } = scheduleData;

    const { data, error } = await supabase
      .from('schedules')
      .insert({
        user_id: userId,
        job_type,
        status,
        schedule_expression,
        timezone,
        config,
        scheduled_for,
        next_run_at,
        schedule_type
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }
};