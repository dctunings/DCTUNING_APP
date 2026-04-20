// AUTO-GENERATED from docs/winols/ecus_full_5.x.json (WinOLS 5.x installer data).
// 549 VAG-relevant ECU variants (filtered from the full 695 by:
//   - Dropping manufacturer = Marelli, Caterpillar
//   - Dropping BMW/Merc-specific variant families (DDE, MEV, MSS, MSD, MSV, MS4x, BMS, EML, EGSx)
// Sorted by variant name length DESC — longer/more specific names matched first.

export interface EcuCatalogEntry {
  variant: string
  manufacturer: string | null
  group: string | null
  plugin: string | null
  use: string | null
}

export const ECU_CATALOG: EcuCatalogEntry[] = [
  {
    "variant": "MS Racing Ecu 6.xx",
    "manufacturer": "Bosch",
    "group": "MS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "5WP4 Simos 4S",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "5WP4 Simos 33",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.7.3.1",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.8.3.2",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MEDG17.9.11",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MEDG17.9.12",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MEDC17.9.3",
    "manufacturer": "Bosch",
    "group": "ME(DC)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.1.10",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.1.11",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.1.21",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.1.27",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.1.61",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.1.62",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.5.21",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.5.20",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.5.24",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.5.25",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.5.26",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.5.27",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.8.10",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.8.31",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.8.32",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.9.11",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.9.52",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.9.63",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MEDG17.9.8",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MEDG17.9.2",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM271DE20",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM271KE20",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos10.10",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos10.13",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos10.14",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos10.20",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos10.22",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos18.10",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos20.20",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simtec71.5",
    "manufacturer": "Siemens/Continental",
    "group": "SIMTEC",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simtec71.6",
    "manufacturer": "Siemens/Continental",
    "group": "SIMTEC",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simtec75.1",
    "manufacturer": "Siemens/Continental",
    "group": "SIMTEC",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simtec81.1",
    "manufacturer": "Siemens/Continental",
    "group": "SIMTEC",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "EDC16C1-7",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C7-7",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16CP31",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16CP32",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16CP33",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16CP34",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16CP35",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16CP36",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16CP39",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16CP42",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16U2.1",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16UC40",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP01",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP02",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP04",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP05",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP06",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP07",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP09",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP10",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP11",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP14",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP15",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP16",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP17",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP18",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP19",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP20",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP21",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP22",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP24",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP27",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP37",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP42",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP44",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP45",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP46",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP47",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP48",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP49",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP52",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP54",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP55",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP57",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP58",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP65",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP66",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP68",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CP74",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CV41",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CV42",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CV44",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CV52",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CV54",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17CV56",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17UC31",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED9.5.10",
    "manufacturer": "Bosch",
    "group": "ME(D)9",
    "plugin": "OLS288",
    "use": "Engine"
  },
  {
    "variant": "ME17.5.20",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.5.22",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.5.24",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.5.2X",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.8.31",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.8.32",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.8.33",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.8.XX",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.9.11",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.9.20",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.9.51",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.9.52",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.9.61",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.9.64",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.9.74",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.0.1",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.0.7",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.1.1",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.1.6",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.1.9",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.2.2",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.2.6",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.3.0",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.3.1",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.3.3",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.3.4",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.3.5",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.3.8",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.4.2",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.4.4",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.5.1",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.5.2",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.5.3",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.5.4",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.5.5",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.5.6",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.6.1",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.6.9",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.7.1",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.7.2",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.7.3",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.7.5",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.7.7",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.7.8",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.8.1",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.8.3",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.8.X",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.9.3",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.9.8",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.9.7",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.9.9",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.9.X",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID807EVO",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": "OLS269",
    "use": "Engine"
  },
  {
    "variant": "SIM2K-140",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM2K-141",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM2K-240",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM2K-341",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos11.1",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos12.1",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": "OLS298",
    "use": "Engine"
  },
  {
    "variant": "Simos12.2",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": "OLS298",
    "use": "Engine"
  },
  {
    "variant": "Simos18.1",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos18.2",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos18.4",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos18.6",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos19.3",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos19.6",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "EDC15C11",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC15C12",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC15VM+",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC15VMP",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC16C10",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C31",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C32",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C33",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C34",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C35",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C36",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C37",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C39",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C41",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C42",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16CP3",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16U31",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16U34",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC17C01",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C06",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C08",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C09",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C10",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C11",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C18",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C19",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C41",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C42",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C43",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C45",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C46",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C47",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C49",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C50",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C53",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C54",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C55",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C56",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C57",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C58",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C59",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C60",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C63",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C64",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C66",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C69",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C70",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C73",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C74",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C76",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C79",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C83",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17C84",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC7UC31",
    "manufacturer": "Bosch",
    "group": "EDC7",
    "plugin": "OLS290",
    "use": "Engine"
  },
  {
    "variant": "ME7.5.10",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS232G",
    "use": "Engine"
  },
  {
    "variant": "ME7.5.20",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS232G",
    "use": "Engine"
  },
  {
    "variant": "ME7.9.10",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS260",
    "use": "Engine"
  },
  {
    "variant": "ME7.9.52",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS260",
    "use": "Engine"
  },
  {
    "variant": "ME7.9.71",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS260",
    "use": "Engine"
  },
  {
    "variant": "MED7.1.1",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED7.6.1",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED7.6.2",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED9.1.1",
    "manufacturer": "Bosch",
    "group": "ME(D)9",
    "plugin": "OLS288",
    "use": "Engine"
  },
  {
    "variant": "MED9.1.5",
    "manufacturer": "Bosch",
    "group": "ME(D)9",
    "plugin": "OLS288",
    "use": "Engine"
  },
  {
    "variant": "MED9.6.1",
    "manufacturer": "Bosch",
    "group": "ME(D)9",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MEDC17.9",
    "manufacturer": "Bosch",
    "group": "ME(DC)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.1.6",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.3.0",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.4.2",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.5.6",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.7.8",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.8.3",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.8.8",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.9.1",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.9.3",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.9.6",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MEDG17.0",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MD1CE101",
    "manufacturer": "Bosch",
    "group": "MD1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MD1CP001",
    "manufacturer": "Bosch",
    "group": "MD1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MD1CP002",
    "manufacturer": "Bosch",
    "group": "MD1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MD1CP004",
    "manufacturer": "Bosch",
    "group": "MD1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MD1CP014",
    "manufacturer": "Bosch",
    "group": "MD1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MD1CP032",
    "manufacturer": "Bosch",
    "group": "MD1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MD1CS001",
    "manufacturer": "Bosch",
    "group": "MD1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MD1CS003",
    "manufacturer": "Bosch",
    "group": "MD1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MD1CS004",
    "manufacturer": "Bosch",
    "group": "MD1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MD1CS005",
    "manufacturer": "Bosch",
    "group": "MD1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MD1CS006",
    "manufacturer": "Bosch",
    "group": "MD1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MD1CS008",
    "manufacturer": "Bosch",
    "group": "MD1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MD1CS069",
    "manufacturer": "Bosch",
    "group": "MD1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MD1CE100",
    "manufacturer": "Bosch",
    "group": "MD1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CP002",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CP007",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CS001",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CS002",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CS003",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CS008",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CS011",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CS015",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CS016",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CS017",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CS019",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CS024",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CS028",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CS042",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CS047",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CS111",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CS163",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CS201",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "CRD3P.C0",
    "manufacturer": "Delphi",
    "group": "CRD3",
    "plugin": "OLS809",
    "use": "Engine"
  },
  {
    "variant": "CRD3P.D1",
    "manufacturer": "Delphi",
    "group": "CRD3",
    "plugin": "OLS809",
    "use": "Engine"
  },
  {
    "variant": "DCM3.7AP",
    "manufacturer": "Delphi",
    "group": "DCM3",
    "plugin": "OLS267",
    "use": "Engine"
  },
  {
    "variant": "SIM271DE",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM271KE",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos3PC",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos6.2",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": "OLS298",
    "use": "Engine"
  },
  {
    "variant": "Simos7.1",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos8.1",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": "OLS298",
    "use": "Engine"
  },
  {
    "variant": "Simos8.2",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": "OLS298",
    "use": "Engine"
  },
  {
    "variant": "Simos8.3",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": "OLS298",
    "use": "Engine"
  },
  {
    "variant": "Simos8.4",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": "OLS298",
    "use": "Engine"
  },
  {
    "variant": "Simos8.5",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": "OLS298",
    "use": "Engine"
  },
  {
    "variant": "Simos9.2",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos9.3",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simtec70",
    "manufacturer": "Siemens/Continental",
    "group": "SIMTEC",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simtec71",
    "manufacturer": "Siemens/Continental",
    "group": "SIMTEC",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simtec75",
    "manufacturer": "Siemens/Continental",
    "group": "SIMTEC",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simtec76",
    "manufacturer": "Siemens/Continental",
    "group": "SIMTEC",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simtec81",
    "manufacturer": "Siemens/Continental",
    "group": "SIMTEC",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simtec90",
    "manufacturer": "Siemens/Continental",
    "group": "SIMTEC",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Sirius32",
    "manufacturer": "Siemens/Continental",
    "group": "SIRIUS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Sirius34",
    "manufacturer": "Siemens/Continental",
    "group": "SIRIUS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "EDC15C0",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC15C2",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC15C3",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC15C4",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC15C5",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC15C6",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC15C7",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC15C9",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC15P+",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC16C0",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C2",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C3",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C4",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C7",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C8",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16C9",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16U1",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC17U1",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC17U5",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "EDC7C32",
    "manufacturer": "Bosch",
    "group": "EDC7",
    "plugin": "OLS290",
    "use": "Engine"
  },
  {
    "variant": "EDC7U31",
    "manufacturer": "Bosch",
    "group": "EDC7",
    "plugin": "OLS290",
    "use": "Engine"
  },
  {
    "variant": "M2.10.4",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "M7.9.41",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG7.9.8",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME2.7.1",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME2.7.2",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME2.8.1",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME7.1.1",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS232G",
    "use": "Engine"
  },
  {
    "variant": "ME7.1.5",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS232G",
    "use": "Engine"
  },
  {
    "variant": "ME7.2.7",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS223",
    "use": "Engine"
  },
  {
    "variant": "ME7.3.1",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS260",
    "use": "Engine"
  },
  {
    "variant": "ME7.3.2",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS260",
    "use": "Engine"
  },
  {
    "variant": "ME7.3H4",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS260",
    "use": "Engine"
  },
  {
    "variant": "ME7.4.3",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS262",
    "use": "Engine"
  },
  {
    "variant": "ME7.4.4",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS262",
    "use": "Engine"
  },
  {
    "variant": "ME7.4.5",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS262",
    "use": "Engine"
  },
  {
    "variant": "ME7.4.6",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS262",
    "use": "Engine"
  },
  {
    "variant": "ME7.4.7",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS262",
    "use": "Engine"
  },
  {
    "variant": "ME7.5.1",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS232G",
    "use": "Engine"
  },
  {
    "variant": "ME7.5.4",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS232G",
    "use": "Engine"
  },
  {
    "variant": "ME7.5.5",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS232G",
    "use": "Engine"
  },
  {
    "variant": "ME7.6.1",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME7.6.2",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME7.6.3",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME7.6.4",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME7.7.0",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME7.8.1",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS223",
    "use": "Engine"
  },
  {
    "variant": "ME7.8.2",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS223",
    "use": "Engine"
  },
  {
    "variant": "ME7.8.4",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS223",
    "use": "Engine"
  },
  {
    "variant": "ME7.8.8",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS223",
    "use": "Engine"
  },
  {
    "variant": "ME7.9.3",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS260",
    "use": "Engine"
  },
  {
    "variant": "ME7.9.5",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS260",
    "use": "Engine"
  },
  {
    "variant": "ME7.9.6",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS260",
    "use": "Engine"
  },
  {
    "variant": "ME7.9.7",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS260",
    "use": "Engine"
  },
  {
    "variant": "ME7.9.9",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS260",
    "use": "Engine"
  },
  {
    "variant": "ME9.1.1",
    "manufacturer": "Bosch",
    "group": "ME(D)9",
    "plugin": "OLS286",
    "use": "Engine"
  },
  {
    "variant": "MED17.0",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.1",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.2",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.4",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MED17.5",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MED17.7",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MG1CP00",
    "manufacturer": "Bosch",
    "group": "MG1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "CRD3.E1",
    "manufacturer": "Delphi",
    "group": "CRD3",
    "plugin": "OLS809",
    "use": "Engine"
  },
  {
    "variant": "DCM3 MB",
    "manufacturer": "Delphi",
    "group": "DCM3",
    "plugin": "OLS809",
    "use": "Engine"
  },
  {
    "variant": "DCM6.2A",
    "manufacturer": "Delphi",
    "group": "DCM6",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "DCM6.2C",
    "manufacturer": "Delphi",
    "group": "DCM6",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "DCM6.2V",
    "manufacturer": "Delphi",
    "group": "DCM6",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "DCM7.1A",
    "manufacturer": "Delphi",
    "group": "DCM7",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "DCM7.24",
    "manufacturer": "Delphi",
    "group": "DCM7",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SDI10.1",
    "manufacturer": "Siemens/Continental",
    "group": "SDI",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SDI10.2",
    "manufacturer": "Siemens/Continental",
    "group": "SDI",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SDI10.4",
    "manufacturer": "Siemens/Continental",
    "group": "SDI",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SDI21.1",
    "manufacturer": "Siemens/Continental",
    "group": "SDI",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SDI21.3",
    "manufacturer": "Siemens/Continental",
    "group": "SDI",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SDI21.X",
    "manufacturer": "Siemens/Continental",
    "group": "SDI",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID801A",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID803A",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": "OLS269",
    "use": "Engine"
  },
  {
    "variant": "SIM4LKE",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos10",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos11",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos12",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": "OLS298",
    "use": "Engine"
  },
  {
    "variant": "Simos15",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos16",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos18",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos22",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos28",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos29",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "EDC15C",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC15M",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC15P",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC15V",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC16+",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC16U",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC7C1",
    "manufacturer": "Bosch",
    "group": "EDC7",
    "plugin": "OLS290",
    "use": "Engine"
  },
  {
    "variant": "EDC7C2",
    "manufacturer": "Bosch",
    "group": "EDC7",
    "plugin": "OLS290",
    "use": "Engine"
  },
  {
    "variant": "EDC7C3",
    "manufacturer": "Bosch",
    "group": "EDC7",
    "plugin": "OLS290",
    "use": "Engine"
  },
  {
    "variant": "EDC7C4",
    "manufacturer": "Bosch",
    "group": "EDC7",
    "plugin": "OLS290",
    "use": "Engine"
  },
  {
    "variant": "EDC7U1",
    "manufacturer": "Bosch",
    "group": "EDC7",
    "plugin": "OLS290",
    "use": "Engine"
  },
  {
    "variant": "M2.1.1",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "M2.8.1",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "M3.8.1",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "M3.8.2",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "M3.8.3",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "M5.2.1",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": "OLS231",
    "use": "Engine"
  },
  {
    "variant": "M5.2.2",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": "OLS231",
    "use": "Engine"
  },
  {
    "variant": "M7.4.4",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "M7.9.5",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "M7.9.0",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "M7.9.7",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "M7.9.8",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME7.01",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME9.0C",
    "manufacturer": "Bosch",
    "group": "ME(D)9",
    "plugin": "OLS286",
    "use": "Engine"
  },
  {
    "variant": "MED9.1",
    "manufacturer": "Bosch",
    "group": "ME(D)9",
    "plugin": "OLS288",
    "use": "Engine"
  },
  {
    "variant": "MED9.7",
    "manufacturer": "Bosch",
    "group": "ME(D)9",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME17.9",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "CRD3.X",
    "manufacturer": "Delphi",
    "group": "CRD3",
    "plugin": "OLS809",
    "use": "Engine"
  },
  {
    "variant": "DCM1.2",
    "manufacturer": "Delphi",
    "group": "DCM1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "DCM2.7",
    "manufacturer": "Delphi",
    "group": "DCM1",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "DCM3.1",
    "manufacturer": "Delphi",
    "group": "DCM3",
    "plugin": "OLS809",
    "use": "Engine"
  },
  {
    "variant": "DCM3.2",
    "manufacturer": "Delphi",
    "group": "DCM3",
    "plugin": "OLS809",
    "use": "Engine"
  },
  {
    "variant": "DCM3.4",
    "manufacturer": "Delphi",
    "group": "DCM3",
    "plugin": "OLS809",
    "use": "Engine"
  },
  {
    "variant": "DCM3.5",
    "manufacturer": "Delphi",
    "group": "DCM3",
    "plugin": "OLS267",
    "use": "Engine"
  },
  {
    "variant": "DCM3.7",
    "manufacturer": "Delphi",
    "group": "DCM3",
    "plugin": "OLS267",
    "use": "Engine"
  },
  {
    "variant": "DCM6.1",
    "manufacturer": "Delphi",
    "group": "DCM6",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "DCM6.2",
    "manufacturer": "Delphi",
    "group": "DCM6",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "DCM6.X",
    "manufacturer": "Delphi",
    "group": "DCM6",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "PPD1.1",
    "manufacturer": "Siemens/Continental",
    "group": "PPD",
    "plugin": "OLS299",
    "use": "Engine"
  },
  {
    "variant": "PPD1.2",
    "manufacturer": "Siemens/Continental",
    "group": "PPD",
    "plugin": "OLS299",
    "use": "Engine"
  },
  {
    "variant": "PPD1.3",
    "manufacturer": "Siemens/Continental",
    "group": "PPD",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "PPD1.5",
    "manufacturer": "Siemens/Continental",
    "group": "PPD",
    "plugin": "OLS299",
    "use": "Engine"
  },
  {
    "variant": "SDI6.1",
    "manufacturer": "Siemens/Continental",
    "group": "SDI",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SDI7.1",
    "manufacturer": "Siemens/Continental",
    "group": "SDI",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID201",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID202",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID203",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID204",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID206",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID207",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID208",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID209",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": "OLS269",
    "use": "Engine"
  },
  {
    "variant": "SID20x",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID211",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID301",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID303",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID304",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID305",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID306",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID307",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID309",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID310",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID801",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID802",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID803",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": "OLS269",
    "use": "Engine"
  },
  {
    "variant": "SID804",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID805",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID806",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID807",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": "OLS269",
    "use": "Engine"
  },
  {
    "variant": "SID881",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID884",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SID902",
    "manufacturer": "Siemens/Continental",
    "group": "SID",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM201",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM210",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM266",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM271",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM4LE",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM90E",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM90P",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM90T",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos2",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos3",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "Simos6",
    "manufacturer": "Siemens/Continental",
    "group": "SIMOS",
    "plugin": "OLS298",
    "use": "Engine"
  },
  {
    "variant": "EDC15",
    "manufacturer": "Bosch",
    "group": "EDC15",
    "plugin": "OLS220",
    "use": "Engine"
  },
  {
    "variant": "EDC16",
    "manufacturer": "Bosch",
    "group": "EDC16",
    "plugin": "OLS228",
    "use": "Engine"
  },
  {
    "variant": "EDC17",
    "manufacturer": "Bosch",
    "group": "EDC17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "M2.81",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "M3.82",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "M3.83",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MA2.4",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME1.0",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME2.8",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME5.2",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME7.0",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME7.1",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS232G",
    "use": "Engine"
  },
  {
    "variant": "ME7.2",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS223",
    "use": "Engine"
  },
  {
    "variant": "ME7.3",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS260",
    "use": "Engine"
  },
  {
    "variant": "ME7.4",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS262",
    "use": "Engine"
  },
  {
    "variant": "ME7.5",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS232G",
    "use": "Engine"
  },
  {
    "variant": "ME7.8",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS223",
    "use": "Engine"
  },
  {
    "variant": "ME9.0",
    "manufacturer": "Bosch",
    "group": "ME(D)9",
    "plugin": "OLS286",
    "use": "Engine"
  },
  {
    "variant": "ME9.1",
    "manufacturer": "Bosch",
    "group": "ME(D)9",
    "plugin": "OLS286",
    "use": "Engine"
  },
  {
    "variant": "ME9.2",
    "manufacturer": "Bosch",
    "group": "ME(D)9",
    "plugin": "OLS266",
    "use": "Engine"
  },
  {
    "variant": "ME9.6",
    "manufacturer": "Bosch",
    "group": "ME(D)9",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME9.7",
    "manufacturer": "Bosch",
    "group": "ME(D)9",
    "plugin": "OLS291",
    "use": "Engine"
  },
  {
    "variant": "MED17",
    "manufacturer": "Bosch",
    "group": "ME(DV)17",
    "plugin": "OLS807",
    "use": "Engine"
  },
  {
    "variant": "MP3.2",
    "manufacturer": "Bosch",
    "group": "MP",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MP5.1",
    "manufacturer": "Bosch",
    "group": "MP",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MP7.0",
    "manufacturer": "Bosch",
    "group": "MP",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MP7.2",
    "manufacturer": "Bosch",
    "group": "MP",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MS6.1",
    "manufacturer": "Bosch",
    "group": "MS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MS6.2",
    "manufacturer": "Bosch",
    "group": "MS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MS6.3",
    "manufacturer": "Bosch",
    "group": "MS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MS6.4",
    "manufacturer": "Bosch",
    "group": "MS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MT20U",
    "manufacturer": "Delphi",
    "group": "MTxx",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SDI10",
    "manufacturer": "Siemens/Continental",
    "group": "SDI",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SDI21",
    "manufacturer": "Siemens/Continental",
    "group": "SDI",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM24",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM28",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM29",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM32",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SIM42",
    "manufacturer": "Siemens/Continental",
    "group": "SIM",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "EDC7",
    "manufacturer": "Bosch",
    "group": "EDC7",
    "plugin": "OLS290",
    "use": "Engine"
  },
  {
    "variant": "M2.7",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "M2.8",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "M3.2",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "M5.2",
    "manufacturer": "Bosch",
    "group": "M(E)1-5",
    "plugin": "OLS231",
    "use": "Engine"
  },
  {
    "variant": "MED9",
    "manufacturer": "Bosch",
    "group": "ME(D)9",
    "plugin": "OLS288",
    "use": "Engine"
  },
  {
    "variant": "CRD3",
    "manufacturer": "Delphi",
    "group": "CRD3",
    "plugin": "OLS809",
    "use": "Engine"
  },
  {
    "variant": "MT34",
    "manufacturer": "Delphi",
    "group": "MTxx",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MT38",
    "manufacturer": "Delphi",
    "group": "MTxx",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MT80",
    "manufacturer": "Delphi",
    "group": "MTxx",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MT86",
    "manufacturer": "Delphi",
    "group": "MTxx",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "MT92",
    "manufacturer": "Delphi",
    "group": "MTxx",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "EMS2",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "2102",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "2103",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "2204",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "2205",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "2211",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "24xx",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "2510",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "2511",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "3031",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "3110",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "3120",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "3125",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "3126",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "3130",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "3132",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "3140",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "3150",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "3155",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "6104",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SDI3",
    "manufacturer": "Siemens/Continental",
    "group": "SDI",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SDI4",
    "manufacturer": "Siemens/Continental",
    "group": "SDI",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SDI6",
    "manufacturer": "Siemens/Continental",
    "group": "SDI",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SDI7",
    "manufacturer": "Siemens/Continental",
    "group": "SDI",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SDI8",
    "manufacturer": "Siemens/Continental",
    "group": "SDI",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "SDI9",
    "manufacturer": "Siemens/Continental",
    "group": "SDI",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "ME7",
    "manufacturer": "Bosch",
    "group": "ME(D)7",
    "plugin": "OLS223",
    "use": "Engine"
  },
  {
    "variant": "ME9",
    "manufacturer": "Bosch",
    "group": "ME(D)9",
    "plugin": "OLS266",
    "use": "Engine"
  },
  {
    "variant": "MS5",
    "manufacturer": "Bosch",
    "group": "MS",
    "plugin": null,
    "use": "Engine"
  },
  {
    "variant": "EMS",
    "manufacturer": "Siemens/Continental",
    "group": "EMS",
    "plugin": null,
    "use": "Engine"
  }
]
