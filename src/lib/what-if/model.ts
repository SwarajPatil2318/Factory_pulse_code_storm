export type WhatIfBaseline = {
  source: "SIMULATED";
  recentDays: number;
  productionDaysPerYear: number;
  tariffInrPerKwh: number;
  lc: {
    dailyEnergyKwh: number;
    dailyProductiveEnergyKwh: number;
    dailyIdleEnergyKwh: number;
    dailyOtherEnergyKwh: number;
    productiveHoursPerDay: number;
    idleHoursPerDay: number;
    avoidableIdleHoursPerDay: number;
    avoidableIdleEnergyKwhPerDay: number;
    idlePowerKw: number;
    jobsPerDay: number;
    jobsPerProductiveHour: number;
  };
  ac: {
    dailyEnergyKwh: number;
    unloadHoursPerDay: number;
    unloadPowerKw: number;
    avoidableUnloadHoursPerDay: number;
    avoidableUnloadEnergyKwhPerDay: number;
  };
  pc: {
    dailyEnergyKwh: number;
    componentsPerDay: number;
    batchesPerDay: number;
    currentComponentsPerBatch: number;
    referenceCapacityComponents: number;
    currentUtilisationPercent: number;
    fixedEnergyPerBatchKwh: number;
    variableEnergyPerComponentKwh: number;
  };
};

export type WhatIfInputs = {
  idleReductionPercent: number;
  standbyCapexInr: number;
  standbyPowerKw: number;
  standbyIdleDurationReductionPercent: number;
  replacementCapexInr: number;
  replacementProductiveKw: number;
  replacementIdleKw: number;
  replacementJobsPerHour: number;
  replacementMaintenanceSavingInrPerYear: number;
  compressorUnloadReductionPercent: number;
  compressorNewUnloadPowerKw: number;
  compressorVfdCapexInr: number;
  coatingUtilisationPercent: number;
  coatingComponentsPerBatch: number;
};

export type ScenarioResult = {
  annualEnergyKwh: number;
  annualEnergyCostInr: number;
  annualEnergySavingKwh: number;
  annualEnergySavingInr: number;
  annualTotalSavingInr: number;
  capexInr: number;
  paybackMonths: number | null;
  fiveYearNetBenefitInr: number;
};
