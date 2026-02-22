---
name: fitness-coach
description: Track food, exercise, and habits. Estimate calories, generate workout plans, calculate streaks, send weekly reports.
---

## When to Use

Use when Adrian:
- Logs a meal or snack ("I had oatmeal for breakfast")
- Logs exercise ("I ran 5km today")
- Asks about calories, macros, or nutrition
- Wants a workout plan or suggestions
- Asks about habit streaks or progress
- Requests a weekly fitness/health summary

## Data Sources

All data lives in the enhanced-memory SQLite database, synced from workspace Markdown files.

| File | Table | What It Tracks |
|------|-------|----------------|
| `FOOD.md` | `food_log` | Meals with calorie estimates |
| `EXERCISE.md` | `exercise_log` | Workouts with duration |
| `HABITS.md` | `habits` | Habit definitions + daily checks |

## Logging Food

When Adrian tells you what he ate:

1. Append to `FOOD.md` under today's date header (`### YYYY-MM-DD`)
2. Format: `- Meal type: Description (~NNN kcal)`
3. Estimate calories based on common portion sizes
4. If unsure about calories, use `~` prefix and note uncertainty

Example:
```markdown
### 2026-02-15
- Breakfast: Oatmeal with banana and honey (~350 kcal)
- Lunch: Chicken caesar salad (~500 kcal)
- Snack: Apple (~80 kcal)
```

### Calorie Estimation Guidelines

- Be conservative — better to slightly overestimate
- Use standard portion sizes unless Adrian specifies amounts
- Common references:
  - Rice (1 cup cooked): ~200 kcal
  - Chicken breast (150g): ~250 kcal
  - Egg: ~70 kcal
  - Banana: ~100 kcal
  - Slice of bread: ~80 kcal
  - Coffee with milk: ~50 kcal

## Logging Exercise

When Adrian tells you about a workout:

1. Append to `EXERCISE.md` under today's date header (`### YYYY-MM-DD`)
2. Format: `- Activity: duration, details`
3. Include duration in minutes when possible

Example:
```markdown
### 2026-02-15
- Running: 30 min, 5km
- Push-ups: 3 sets x 15 reps
```

## Tracking Habits

Habits are tracked in `HABITS.md`:

- **Definitions** in the Active Habits table (name, target, streak)
- **Daily checks** under date headers with checkboxes

When Adrian completes a habit:
1. Mark `- [ ]` as `- [x]` for today
2. Update the streak count in the table if all daily targets are met

## Weekly Reports

When generating a weekly report (triggered by Sunday evening cron or on request):

1. **Food summary**: Total estimated calories per day, daily average, any days with no logging
2. **Exercise summary**: Total sessions, total duration, most frequent activity
3. **Habit summary**: Completion rate per habit, current streaks, longest streaks
4. **Trends**: Compare this week to previous week if data available
5. **Encouragement**: Highlight wins, suggest gentle improvements

Format the report conversationally — Adrian prefers direct, non-preachy coaching.

## Workout Plan Generation

When asked for a workout plan:

1. Check recent exercise log for current activity level
2. Ask about goals if not clear (strength, cardio, flexibility, weight loss)
3. Generate a 7-day plan respecting rest days
4. Keep it realistic — Adrian has a desk job and an RTX 5090 to enjoy

## Important Rules

- NEVER guilt-trip about missed meals, workouts, or habits
- Be encouraging but honest — if calorie intake is very high, mention it matter-of-factly
- Always log FIRST, then discuss — never block logging with questions
- Use Slovak for all user-facing text in reports and responses
- Calorie estimates are rough — say "approximately" not "exactly"
- If Adrian says "skip" for a meal, log it as "- Skipped" with no calorie entry
