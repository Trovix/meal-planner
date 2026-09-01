# iPhone Shortcut Setup

1. Open **Shortcuts** on your iPhone and tap **+**.
2. Name the shortcut exactly **Add Shopping List**.
3. Add the **Split Text** action:
   - Set the text to **Shortcut Input**.
   - Set the separator to **New Lines**.
4. Add **Repeat with Each**, using the result from **Split Text**.
5. Inside the repeat block, add **Add New Reminder**:
   - Set the reminder title to **Repeat Item**.
   - Select your preferred Reminders list, such as **Shopping**.
6. Optionally add **Open Reminders** after the repeat block.
7. Tap **Done**.

The finished shortcut should look like this:

```text
Split Shortcut Input by New Lines
Repeat with Each item in Split Text
    Add Repeat Item to Shopping
End Repeat
```

Open [meal.james-platt.com](https://meal.james-platt.com/) in Safari, expand a recipe and tap **Add to Reminders**. The first time it runs, approve **Open in Shortcuts** and allow access to Reminders.
