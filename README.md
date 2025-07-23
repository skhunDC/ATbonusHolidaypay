# AT Bonus & Holiday Pay

This repository stores a Google Apps Script project that automates the monthly
and annual bonus calculations for employees. It also determines eligibility for
holiday pay. The script runs inside a Google Spreadsheet where each sheet acts
as a lightweight database.

* `Code.gs` &ndash; Apps Script backend that imports roster data, records
  absences, tracks holidays and computes bonus amounts.
* `index.html` &ndash; A small single page app served by `doGet()` providing a
  dashboard, roster import and reporting tools.
* `ATT Bonus & Holiday Pay.xlsx` &ndash; Example spreadsheet containing the
  expected sheet layout.

To use the project, open the spreadsheet in Google Sheets and attach this Apps
Script project. The `setup()` function creates nightly triggers and ensures the
required sheets (`UKGDat`, `Absenses`, `Holiday`, `MonthlyBonus`,
`AnnualBonus`) exist.

There are no automated tests. Functionality should be verified manually in the
Apps Script editor after making changes.


## Contributing

See [AGENTS.md](AGENTS.md) for how to get started and tips for making changes.
