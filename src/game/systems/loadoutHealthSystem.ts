import {
  FactionId,
  FirearmState,
  HealthStatus,
  MedicalGearSpec,
  MeleeSwordSpec,
  PlayerCombatState,
  PrimaryFirearmSpec,
  SwordState,
  WeaponSlot,
} from '../types/systems';

export const FACTION_PRIMARY_FIREARMS: Record<FactionId, PrimaryFirearmSpec> = {
  [FactionId.EAST]: {
    id: 'ak205m-tac',
    designation: 'AK-205M Kalashnikov Modernized Carbine',
    caliber: '5.45x39mm 7N40 Enhanced Penetrator',
    originFaction: FactionId.EAST,
    magazineCapacity: 30,
    initialReserveAmmo: 240,
    maxReserveAmmo: 360,
    roundsPerMinute: 650,
    muzzleVelocityMps: 880,
    baseDamage: 32,
    armorPenetrationRating: 0.68,
    tacticalReloadSec: 1.85,
    dryReloadSec: 2.45,
    effectiveRangeMeters: 500,
  },
  [FactionId.WEST]: {
    id: 'mcx-spear-68',
    designation: 'XM7 MCX-Spear NGSW Tactical Rifle',
    caliber: '6.8x51mm (.277 Fury) Bimodal Hybrid',
    originFaction: FactionId.WEST,
    magazineCapacity: 25,
    initialReserveAmmo: 225,
    maxReserveAmmo: 325,
    roundsPerMinute: 680,
    muzzleVelocityMps: 915,
    baseDamage: 38,
    armorPenetrationRating: 0.78,
    tacticalReloadSec: 1.9,
    dryReloadSec: 2.5,
    effectiveRangeMeters: 600,
  },
};

export const FACTION_EMERGENCY_SWORDS: Record<FactionId, MeleeSwordSpec> = {
  [FactionId.EAST]: {
    id: 'ratnik-wakizashi-98',
    designation: 'Kizlyar Type-98 High-Carbon Tactical Blade',
    steelGrade: 'CPM-3V Cryo-Tempered Tool Steel (60 HRC)',
    maxDurability: 100,
    durabilityLossPerHit: 1.25,
    slash1Damage: 58,
    slash2Damage: 66,
    thrust3Damage: 92,
    armorBypassRatio: 0.85,
    reachMeters: 3.1,
    cleaveArcDeg: 105,
    startupWindowSec: 0.11,
    activeCollisionWindowSec: 0.17,
    recoveryWindowSec: 0.22,
    comboChainGraceSec: 0.45,
    emergencyAutoDrawSec: 0.22,
  },
  [FactionId.WEST]: {
    id: 'winkler-combat-saber',
    designation: 'Winkler WK-II Close-Quarters Breach Saber',
    steelGrade: '80CrV2 Black-Oxide Forged Carbon Steel',
    maxDurability: 100,
    durabilityLossPerHit: 1.25,
    slash1Damage: 58,
    slash2Damage: 66,
    thrust3Damage: 92,
    armorBypassRatio: 0.85,
    reachMeters: 3.1,
    cleaveArcDeg: 105,
    startupWindowSec: 0.11,
    activeCollisionWindowSec: 0.17,
    recoveryWindowSec: 0.22,
    comboChainGraceSec: 0.45,
    emergencyAutoDrawSec: 0.22,
  },
};

export const STANDARD_MEDICAL_GEAR: MedicalGearSpec = {
  id: 'ifak-gen4-trauma',
  designation: 'Gen-4 IFAK Hemostatic Auto-Injector & Chest Seal',
  initialCharges: 4,
  maxCharges: 6,
  instantHealHp: 45,
  regenOverTimeHp: 25,
  regenDurationSec: 5.0,
  applicationTimeSec: 1.6,
  moveSpeedMultiplierWhileApplying: 0.65,
};

export function createInitialPlayerCombatState(faction: FactionId): PlayerCombatState {
  const gun = FACTION_PRIMARY_FIREARMS[faction];
  const sword = FACTION_EMERGENCY_SWORDS[faction];

  return {
    hp: 100,
    maxHp: 100,
    armorIntegrity: 100,
    maxArmorIntegrity: 100,
    healthStatus: HealthStatus.NOMINAL,
    medkitsRemaining: STANDARD_MEDICAL_GEAR.initialCharges,
    medkitMax: STANDARD_MEDICAL_GEAR.maxCharges,
    medkitProgressSec: 0,
    regenRemainingHp: 0,

    equippedSlot: WeaponSlot.PRIMARY_FIREARM,
    firearmState: FirearmState.IDLE,
    magazineAmmo: gun.magazineCapacity,
    magazineCapacity: gun.magazineCapacity,
    reserveAmmo: gun.initialReserveAmmo,
    fireCooldownSec: 0,
    reloadTimerSec: 0,
    reloadDurationSec: 0,

    swordState: SwordState.SHEATHED,
    swordDurability: sword.maxDurability,
    swordMaxDurability: sword.maxDurability,
    swordStateTimerSec: 0,
    comboQueuedNext: false,
    activeHitEntitiesThisSwing: [],
    autoSwitchedOnZeroAmmo: false,
  };
}

export interface CombatTickEvents {
  firedShot: boolean;
  dryClicked: boolean;
  startedReload: boolean;
  completedReload: boolean;
  autoDrewSword: boolean;
  swordSlashTriggered: 0 | 1 | 2 | 3;
  swordCollisionWindowOpen: boolean;
  medkitStarted: boolean;
  medkitCompleted: boolean;
}

/**
 * Pure, deterministic hierarchical state machine tick for Player Loadout & Standardized HP.
 * Zero hunger, thirst, or stamina mechanics—survival depends strictly on HP pool, ballistic
 * plate integrity, and tactical medical gear timing.
 */
export function stepPlayerCombatStateMachine(
  state: PlayerCombatState,
  faction: FactionId,
  dt: number,
  inputs: {
    triggerHeld: boolean;
    triggerJustPressed: boolean;
    reloadJustPressed: boolean;
    switchSlotJustPressed: boolean;
    quickMeleeJustPressed: boolean;
    healJustPressed: boolean;
  }
): CombatTickEvents {
  const gun = FACTION_PRIMARY_FIREARMS[faction];
  const sword = FACTION_EMERGENCY_SWORDS[faction];

  const events: CombatTickEvents = {
    firedShot: false,
    dryClicked: false,
    startedReload: false,
    completedReload: false,
    autoDrewSword: false,
    swordSlashTriggered: 0,
    swordCollisionWindowOpen: false,
    medkitStarted: false,
    medkitCompleted: false,
  };

  if (state.hp <= 0) {
    state.hp = 0;
    state.healthStatus = HealthStatus.INCAPACITATED;
    return events;
  }

  // 1. Standardized HP & Medical Kit State Machine
  if (state.regenRemainingHp > 0) {
    const regenRate = STANDARD_MEDICAL_GEAR.regenOverTimeHp / STANDARD_MEDICAL_GEAR.regenDurationSec;
    const healStep = Math.min(state.regenRemainingHp, regenRate * dt);
    state.hp = Math.min(state.maxHp, state.hp + healStep);
    state.regenRemainingHp = Math.max(0, state.regenRemainingHp - healStep);
  }

  if (
    inputs.healJustPressed &&
    state.healthStatus !== HealthStatus.APPLYING_MEDKIT &&
    state.medkitsRemaining > 0 &&
    state.hp < state.maxHp
  ) {
    state.healthStatus = HealthStatus.APPLYING_MEDKIT;
    state.medkitProgressSec = 0;
    events.medkitStarted = true;
  }

  if (state.healthStatus === HealthStatus.APPLYING_MEDKIT) {
    state.medkitProgressSec += dt;
    if (state.medkitProgressSec >= STANDARD_MEDICAL_GEAR.applicationTimeSec) {
      state.medkitsRemaining = Math.max(0, state.medkitsRemaining - 1);
      state.hp = Math.min(state.maxHp, state.hp + STANDARD_MEDICAL_GEAR.instantHealHp);
      state.regenRemainingHp += STANDARD_MEDICAL_GEAR.regenOverTimeHp;
      state.medkitProgressSec = 0;
      events.medkitCompleted = true;
      state.healthStatus = computeHealthBand(state.hp, state.maxHp);
    }
  } else {
    state.healthStatus = computeHealthBand(state.hp, state.maxHp);
  }

  // 2. Manual Slot Toggle or Quick-Melee Interrupt
  if (inputs.switchSlotJustPressed) {
    if (state.equippedSlot === WeaponSlot.PRIMARY_FIREARM) {
      equipSwordStance(state, sword, false);
    } else {
      equipFirearmSlot(state);
    }
  } else if (inputs.quickMeleeJustPressed && state.equippedSlot === WeaponSlot.PRIMARY_FIREARM) {
    equipSwordStance(state, sword, false);
    beginSwordSwing(state, 1, sword, events);
  }

  // 3. Primary Firearm State Machine
  state.fireCooldownSec = Math.max(0, state.fireCooldownSec - dt);

  if (state.equippedSlot === WeaponSlot.PRIMARY_FIREARM) {
    if (
      state.firearmState === FirearmState.RELOAD_TACTICAL ||
      state.firearmState === FirearmState.RELOAD_DRY
    ) {
      state.reloadTimerSec += dt;
      if (state.reloadTimerSec >= state.reloadDurationSec) {
        const needed = state.magazineCapacity - state.magazineAmmo;
        const loaded = Math.min(needed, state.reserveAmmo);
        state.magazineAmmo += loaded;
        state.reserveAmmo -= loaded;
        state.reloadTimerSec = 0;
        state.reloadDurationSec = 0;
        state.firearmState = state.magazineAmmo > 0 ? FirearmState.IDLE : FirearmState.DRY_EMPTY;
        events.completedReload = true;
      }
    } else {
      // Check manual reload request
      if (
        inputs.reloadJustPressed &&
        state.magazineAmmo < state.magazineCapacity &&
        state.reserveAmmo > 0
      ) {
        const isTactical = state.magazineAmmo > 0;
        state.firearmState = isTactical
          ? FirearmState.RELOAD_TACTICAL
          : FirearmState.RELOAD_DRY;
        state.reloadTimerSec = 0;
        state.reloadDurationSec = isTactical ? gun.tacticalReloadSec : gun.dryReloadSec;
        events.startedReload = true;
      } else if (inputs.triggerHeld && state.fireCooldownSec <= 0) {
        if (state.magazineAmmo > 0) {
          // Fire round
          state.magazineAmmo -= 1;
          state.fireCooldownSec = 60 / gun.roundsPerMinute;
          state.firearmState = FirearmState.FIRING;
          events.firedShot = true;

          // Automatic reload or emergency zero-ammo sword transition!
          if (state.magazineAmmo === 0 && state.reserveAmmo === 0) {
            equipSwordStance(state, sword, true);
            events.autoDrewSword = true;
          }
        } else if (state.reserveAmmo > 0) {
          // Auto-initiate dry reload on trigger pull when reserve exists
          state.firearmState = FirearmState.RELOAD_DRY;
          state.reloadTimerSec = 0;
          state.reloadDurationSec = gun.dryReloadSec;
          events.startedReload = true;
        } else {
          // Total Zero-Ammo Emergency Condition -> Instant Sword Reflex Draw!
          if (inputs.triggerJustPressed) {
            events.dryClicked = true;
          }
          equipSwordStance(state, sword, true);
          events.autoDrewSword = true;
        }
      } else if (state.fireCooldownSec <= 0) {
        state.firearmState =
          state.magazineAmmo > 0 ? FirearmState.IDLE : FirearmState.DRY_EMPTY;
      }
    }
  }

  // 4. High-Durability Melee Sword State Machine & Collision Window Timing
  if (state.equippedSlot === WeaponSlot.EMERGENCY_SWORD) {
    state.swordStateTimerSec += dt;

    if (inputs.triggerJustPressed) {
      if (state.swordState === SwordState.READY_STANCE) {
        beginSwordSwing(state, 1, sword, events);
      } else if (
        state.swordState === SwordState.SLASH_1_ACTIVE ||
        state.swordState === SwordState.SLASH_1_RECOVERY ||
        state.swordState === SwordState.SLASH_2_ACTIVE ||
        state.swordState === SwordState.SLASH_2_RECOVERY
      ) {
        state.comboQueuedNext = true;
      }
    }

    switch (state.swordState) {
      case SwordState.EMERGENCY_DRAW:
        if (state.swordStateTimerSec >= sword.emergencyAutoDrawSec) {
          state.swordState = SwordState.READY_STANCE;
          state.swordStateTimerSec = 0;
          if (inputs.triggerHeld) {
            beginSwordSwing(state, 1, sword, events);
          }
        }
        break;

      case SwordState.SLASH_1_STARTUP:
        if (state.swordStateTimerSec >= sword.startupWindowSec) {
          state.swordState = SwordState.SLASH_1_ACTIVE;
          state.swordStateTimerSec = 0;
          state.activeHitEntitiesThisSwing = [];
        }
        break;

      case SwordState.SLASH_1_ACTIVE:
        events.swordCollisionWindowOpen = true;
        if (state.swordStateTimerSec >= sword.activeCollisionWindowSec) {
          if (state.comboQueuedNext) {
            beginSwordSwing(state, 2, sword, events);
          } else {
            state.swordState = SwordState.SLASH_1_RECOVERY;
            state.swordStateTimerSec = 0;
          }
        }
        break;

      case SwordState.SLASH_1_RECOVERY:
        if (state.comboQueuedNext) {
          beginSwordSwing(state, 2, sword, events);
        } else if (state.swordStateTimerSec >= sword.recoveryWindowSec) {
          state.swordState = SwordState.READY_STANCE;
          state.swordStateTimerSec = 0;
        }
        break;

      case SwordState.SLASH_2_STARTUP:
        if (state.swordStateTimerSec >= sword.startupWindowSec) {
          state.swordState = SwordState.SLASH_2_ACTIVE;
          state.swordStateTimerSec = 0;
          state.activeHitEntitiesThisSwing = [];
        }
        break;

      case SwordState.SLASH_2_ACTIVE:
        events.swordCollisionWindowOpen = true;
        if (state.swordStateTimerSec >= sword.activeCollisionWindowSec) {
          if (state.comboQueuedNext) {
            beginSwordSwing(state, 3, sword, events);
          } else {
            state.swordState = SwordState.SLASH_2_RECOVERY;
            state.swordStateTimerSec = 0;
          }
        }
        break;

      case SwordState.SLASH_2_RECOVERY:
        if (state.comboQueuedNext) {
          beginSwordSwing(state, 3, sword, events);
        } else if (state.swordStateTimerSec >= sword.recoveryWindowSec) {
          state.swordState = SwordState.READY_STANCE;
          state.swordStateTimerSec = 0;
        }
        break;

      case SwordState.THRUST_3_STARTUP:
        if (state.swordStateTimerSec >= sword.startupWindowSec * 1.15) {
          state.swordState = SwordState.THRUST_3_ACTIVE;
          state.swordStateTimerSec = 0;
          state.activeHitEntitiesThisSwing = [];
        }
        break;

      case SwordState.THRUST_3_ACTIVE:
        events.swordCollisionWindowOpen = true;
        if (state.swordStateTimerSec >= sword.activeCollisionWindowSec * 1.15) {
          state.swordState = SwordState.THRUST_3_RECOVERY;
          state.swordStateTimerSec = 0;
        }
        break;

      case SwordState.THRUST_3_RECOVERY:
        if (state.swordStateTimerSec >= sword.recoveryWindowSec * 1.35) {
          state.swordState = SwordState.READY_STANCE;
          state.swordStateTimerSec = 0;
        }
        break;

      default:
        break;
    }
  }

  return events;
}

function equipSwordStance(
  state: PlayerCombatState,
  _sword: MeleeSwordSpec,
  autoZeroAmmo: boolean
): void {
  state.equippedSlot = WeaponSlot.EMERGENCY_SWORD;
  state.firearmState = FirearmState.HOLSTERED;
  state.reloadTimerSec = 0;
  state.swordState = SwordState.EMERGENCY_DRAW;
  state.swordStateTimerSec = 0;
  state.comboQueuedNext = false;
  state.activeHitEntitiesThisSwing = [];
  state.autoSwitchedOnZeroAmmo = autoZeroAmmo;
}

function equipFirearmSlot(state: PlayerCombatState): void {
  state.equippedSlot = WeaponSlot.PRIMARY_FIREARM;
  state.swordState = SwordState.SHEATHED;
  state.swordStateTimerSec = 0;
  state.comboQueuedNext = false;
  state.firearmState =
    state.magazineAmmo > 0 ? FirearmState.IDLE : FirearmState.DRY_EMPTY;
}

function beginSwordSwing(
  state: PlayerCombatState,
  step: 1 | 2 | 3,
  _sword: MeleeSwordSpec,
  events: CombatTickEvents
): void {
  state.comboQueuedNext = false;
  state.swordStateTimerSec = 0;
  state.activeHitEntitiesThisSwing = [];
  events.swordSlashTriggered = step;
  if (step === 1) state.swordState = SwordState.SLASH_1_STARTUP;
  else if (step === 2) state.swordState = SwordState.SLASH_2_STARTUP;
  else state.swordState = SwordState.THRUST_3_STARTUP;
}

export function applyIncomingPlayerDamage(
  state: PlayerCombatState,
  rawDamage: number,
  armorPiercingFactor = 0.35
): number {
  if (state.hp <= 0) return 0;

  // Ballistic plate absorbs 55% of non-piercing damage while plate integrity remains
  const plateRatio = state.armorIntegrity / Math.max(1, state.maxArmorIntegrity);
  const effectiveMitigation = plateRatio > 0.05 ? (1 - armorPiercingFactor) * 0.55 : 0;

  const absorbedByPlate = rawDamage * effectiveMitigation;
  const finalHpDamage = Math.max(1, Math.round(rawDamage - absorbedByPlate));

  state.armorIntegrity = Math.max(0, Math.round(state.armorIntegrity - absorbedByPlate * 0.85));
  state.hp = Math.max(0, state.hp - finalHpDamage);
  state.healthStatus = computeHealthBand(state.hp, state.maxHp);

  return finalHpDamage;
}

export function computeSwordSwingDamage(
  state: PlayerCombatState,
  faction: FactionId
): number {
  const spec = FACTION_EMERGENCY_SWORDS[faction];
  // High-durability tempered steel maintains 100% edge lethality down to 15% durability, never shatters
  const edgeFactor = state.swordDurability > 15 ? 1.0 : 0.78;
  if (state.swordState === SwordState.THRUST_3_ACTIVE) {
    return Math.round(spec.thrust3Damage * edgeFactor);
  }
  if (state.swordState === SwordState.SLASH_2_ACTIVE) {
    return Math.round(spec.slash2Damage * edgeFactor);
  }
  return Math.round(spec.slash1Damage * edgeFactor);
}

function computeHealthBand(hp: number, maxHp: number): HealthStatus {
  if (hp <= 0) return HealthStatus.INCAPACITATED;
  const pct = hp / maxHp;
  if (pct <= 0.3) return HealthStatus.CRITICAL;
  if (pct < 0.85) return HealthStatus.DAMAGED;
  return HealthStatus.NOMINAL;
}
