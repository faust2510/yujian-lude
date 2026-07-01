UPDATE app_settings
   SET value = jsonb_set(value, '{pool}', '"earned"', true),
       label = '每日签到累计积分',
       updated_at = now()
 WHERE key = 'points.daily_checkin';
