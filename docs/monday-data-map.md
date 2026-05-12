# Monday Data Map

Claude Code should use the monday.com connector to find the boards that contain job and logistics information, then write `data/monday-jobs.json`.

## Minimum Fields Needed

For each active or upcoming job:

- job number
- monday item id
- board name
- item name
- customer name
- address
- city or area
- client type
- job type
- current status
- priority
- promised date or target date
- material status
- whether materials are ready
- estimated crew days
- estimated people needed
- preferred crew
- crew restrictions
- equipment needed
- trailer needed
- driver needed
- skid steer needed
- concrete pump needed
- warehouse/Wilson support needed
- logistics status
- logistics owner
- notes or latest useful update

## Suggested Monday Search Strategy

1. List all boards the connector can access.
2. Identify likely source-of-truth boards by board name and column names.
3. Prefer boards with job numbers, addresses, status, due dates, and material/logistics columns.
4. Pull only active/upcoming jobs first.
5. Include recently completed jobs only if they still appear on the schedule.

## Output Shape

Use `schemas/monday-job.schema.json`.

The file should look like this:

```json
{
  "generatedAt": "2026-04-26T09:00:00-04:00",
  "boards": [
    {
      "boardId": "123",
      "boardName": "Active Jobs",
      "purpose": "Main source of job scope and readiness"
    }
  ],
  "jobs": [
    {
      "jobNumber": "170810",
      "mondayItemId": "456",
      "boardName": "Active Jobs",
      "itemName": "SONDRA WELLS #170810",
      "customerName": "SONDRA WELLS",
      "address": "123 Example St",
      "city": "Orlando",
      "clientType": "retail or service client",
      "jobType": "deck / repair / sealer",
      "status": "Ready to schedule",
      "priority": "High",
      "promisedDate": "2026-05-01",
      "materialStatus": "Ready",
      "materialReady": true,
      "estimatedCrewDays": 2,
      "estimatedPeople": 2,
      "crewPreference": "Ludwing / Tarcizio",
      "crewRestrictions": "",
      "equipmentNeeded": [],
      "trailerNeeded": ["flat trailer"],
      "driverNeeded": true,
      "skidSteerNeeded": false,
      "concretePumpNeeded": false,
      "warehouseSupportNeeded": false,
      "logisticsStatus": "Needs driver assignment",
      "logisticsOwner": "",
      "notes": "Latest update summary from monday.com."
    }
  ]
}
```

## Board Ambiguity Rule

If multiple boards look like the source of truth, Claude Code should stop and ask which one to use before building automation around the wrong board.
