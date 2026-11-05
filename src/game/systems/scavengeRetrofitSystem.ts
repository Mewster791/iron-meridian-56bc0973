import {
  FactionId,
  RetrofitCategory,
  RetrofitStage,
  RetrofitTechNode,
  SalvageInventory,
  SquadOrder,
  TacticalUnitVehicleState,
} from '../types/systems';

export function createInitialSalvageInventory(faction: FactionId): SalvageInventory {
  return {
    rawScrapAlloy: 65,
    westernCompositePlates: faction === FactionId.EAST ? 2 : 4,
    easternEraBlocks: faction === FactionId.WEST ? 2 : 4,
    encryptedFireControlChips: 2,
    milStdBusAdapters: 1,
    ordnanceCells: 3,
  };
}

export function createInitialVehicleState(faction: FactionId): TacticalUnitVehicleState {
  if (faction === FactionId.EAST) {
    return {
      callsign: 'BURAN-4',
      chassisDesignation: 'BTR-82A 8x8 Tactical Command Carrier',
      faction: FactionId.EAST,
      hullHp: 1000,
      maxHullHp: 1000,
      armorPlatingHp: 350,
      maxArmorPlatingHp: 350,
      kineticMitigation: 0.22,
      shapedChargeMitigation: 0.14,
      apsCharges: 0,
      maxApsCharges: 0,
      massKg: 15400,
      hasEraTiles: false,
      hasApsRadar: false,
      hasThermalMast: false,
      hasRemoteTurret: false,
      squadOperatorsAlive: 4,
      squadMaxOperators: 4,
      currentOrder: SquadOrder.FOLLOW_WEDGE,
    };
  }

  return {
    callsign: 'LANCER-2',
    chassisDesignation: 'M1126 Stryker ICV Recon Command Carrier',
    faction: FactionId.WEST,
    hullHp: 1000,
    maxHullHp: 1000,
    armorPlatingHp: 380,
    maxArmorPlatingHp: 380,
    kineticMitigation: 0.25,
    shapedChargeMitigation: 0.16,
    apsCharges: 0,
    maxApsCharges: 0,
    massKg: 16470,
    hasEraTiles: false,
    hasApsRadar: false,
    hasThermalMast: false,
    hasRemoteTurret: false,
    squadOperatorsAlive: 4,
    squadMaxOperators: 4,
    currentOrder: SquadOrder.FOLLOW_WEDGE,
  };
}

/**
 * Complete Asymmetrical Cross-Faction Tech Tree.
 * East units capture and adapt West hardware (MIL-STD-1553 / NATO STANAG -> GOST bus & mounting lugs),
 * while West units capture and adapt East hardware (Relikt ERA, Arena-M, Kornet-EM, Krasukha-4).
 */
export function createTechTreeForFaction(playerFaction: FactionId): RetrofitTechNode[] {
  if (playerFaction === FactionId.EAST) {
    return [
      {
        id: 'east-loot-arat2-era',
        code: 'W-ARM-01',
        name: 'Captured M19 ARAT-2 Reactive Armor Package',
        originFaction: FactionId.WEST,
        usableByFaction: FactionId.EAST,
        category: RetrofitCategory.VEHICLE_ARMOR,
        stage: RetrofitStage.SALVAGE_CAPTURED,
        sourceDescription:
          'Salvaged from intercepted Western Bradley/Stryker heavy logistics convoys.',
        adapterEngineeringNote:
          'Welds 14mm dovetail standoff brackets onto BTR-82A sloped RHA hull to mount NATO M19 energetic tiles without sympathetic hull spalling.',
        costScrapAlloy: 40,
        costArmorUnits: 2,
        costControlChips: 0,
        fabricationTimeSec: 3.5,
        prerequisiteNodeIds: [],
        statModifiers: {
          vehicleMaxArmorBonus: 420,
          kineticMitigationBonus: 0.16,
          shapedChargeMitigationBonus: 0.52,
          apsInterceptCharges: 0,
          squadFirepowerMultiplier: 1.0,
          weaponConvergenceBonus: 0,
          chassisMassDeltaKg: 1180,
        },
        visualMeshFlag: 'ERA_TILES',
      },
      {
        id: 'east-loot-trophy-aps',
        code: 'W-APS-02',
        name: 'Retrofitted AN/VLQ-12 Trophy-Light Hard-Kill APS',
        originFaction: FactionId.WEST,
        usableByFaction: FactionId.EAST,
        category: RetrofitCategory.ACTIVE_PROTECTION,
        stage: RetrofitStage.LOCKED_UNSEEN,
        sourceDescription:
          'Looted AESA micro-radar panels and MEFP counter-launchers from Western escort vehicles.',
        adapterEngineeringNote:
          'Steps 24V Russian alternator power to regulated 28V MIL-STD-1275D bus and flashes FPGA translator to auto-slew turret azimuth.',
        costScrapAlloy: 55,
        costArmorUnits: 1,
        costControlChips: 2,
        fabricationTimeSec: 5.0,
        prerequisiteNodeIds: ['east-loot-arat2-era'],
        statModifiers: {
          vehicleMaxArmorBonus: 120,
          kineticMitigationBonus: 0.05,
          shapedChargeMitigationBonus: 0.14,
          apsInterceptCharges: 4,
          squadFirepowerMultiplier: 1.05,
          weaponConvergenceBonus: 0,
          chassisMassDeltaKg: 480,
        },
        visualMeshFlag: 'APS_RADAR',
      },
      {
        id: 'east-loot-citv-optics',
        code: 'W-OPT-03',
        name: '3rd-Gen FLIR CITV Hunter-Killer Thermal Mast',
        originFaction: FactionId.WEST,
        usableByFaction: FactionId.EAST,
        category: RetrofitCategory.FIRE_CONTROL_OPTICS,
        stage: RetrofitStage.SALVAGE_CAPTURED,
        sourceDescription:
          'Recovered cooled LWIR commander sight assembly from reconnaissance convoys.',
        adapterEngineeringNote:
          'Bridges HD-SDI thermal video feed into BTR-82A TKN-4GA digital ballistic display via field-milled collar mount.',
        costScrapAlloy: 30,
        costArmorUnits: 0,
        costControlChips: 2,
        fabricationTimeSec: 3.0,
        prerequisiteNodeIds: [],
        statModifiers: {
          vehicleMaxArmorBonus: 0,
          kineticMitigationBonus: 0,
          shapedChargeMitigationBonus: 0,
          apsInterceptCharges: 0,
          squadFirepowerMultiplier: 1.18,
          weaponConvergenceBonus: 0.25,
          chassisMassDeltaKg: 95,
        },
        visualMeshFlag: 'THERMAL_MAST',
      },
      {
        id: 'east-loot-crows-turret',
        code: 'W-ORD-04',
        name: 'M153 CROWS-J Coaxial Javelin Pod Integration',
        originFaction: FactionId.WEST,
        usableByFaction: FactionId.EAST,
        category: RetrofitCategory.SQUAD_ORDNANCE,
        stage: RetrofitStage.LOCKED_UNSEEN,
        sourceDescription:
          'Captured remote weapon station & fire-and-forget top-attack ATGM canister.',
        adapterEngineeringNote:
          'Mounts NATO STANAG 4694 rail cradle parallel to 30mm 2A72 autocannon with isolated battery coolant loop.',
        costScrapAlloy: 65,
        costArmorUnits: 2,
        costControlChips: 3,
        fabricationTimeSec: 5.5,
        prerequisiteNodeIds: ['east-loot-citv-optics'],
        statModifiers: {
          vehicleMaxArmorBonus: 60,
          kineticMitigationBonus: 0.04,
          shapedChargeMitigationBonus: 0,
          apsInterceptCharges: 0,
          squadFirepowerMultiplier: 1.35,
          weaponConvergenceBonus: 0.15,
          chassisMassDeltaKg: 210,
        },
        visualMeshFlag: 'REMOTE_TURRET',
      },
      {
        id: 'east-loot-ngsw-ballistics',
        code: 'W-INF-05',
        name: 'XM157 Ballistic Fire-Control Squad Optics & Hybrid 6.8mm Sabots',
        originFaction: FactionId.WEST,
        usableByFaction: FactionId.EAST,
        category: RetrofitCategory.SQUAD_ORDNANCE,
        stage: RetrofitStage.SALVAGE_CAPTURED,
        sourceDescription:
          'Captured Western infantry weapon crates containing laser-rangefinding smart scopes and high-pressure bimodal cartridges.',
        adapterEngineeringNote:
          'Re-profiles Zenitco Picatinny dust-cover zeroing tables for 850m/s high-pressure penetrator loads across all 4 squad riflemen.',
        costScrapAlloy: 35,
        costArmorUnits: 1,
        costControlChips: 1,
        fabricationTimeSec: 2.5,
        prerequisiteNodeIds: [],
        statModifiers: {
          vehicleMaxArmorBonus: 0,
          kineticMitigationBonus: 0,
          shapedChargeMitigationBonus: 0,
          apsInterceptCharges: 0,
          squadFirepowerMultiplier: 1.24,
          weaponConvergenceBonus: 0.3,
          chassisMassDeltaKg: 0,
        },
        visualMeshFlag: 'HYBRID_AMMO',
      },
      {
        id: 'east-loot-duke-ew',
        code: 'W-EW-06',
        name: 'AN/VLQ-12 CREW Duke Drone-Jammer Array',
        originFaction: FactionId.WEST,
        usableByFaction: FactionId.EAST,
        category: RetrofitCategory.ELECTRONIC_WARFARE,
        stage: RetrofitStage.LOCKED_UNSEEN,
        sourceDescription:
          'Salvaged wideband Counter-UAS electronic attack rack from Western command trucks.',
        adapterEngineeringNote:
          'Notch-filters friendly Russian R-168 VHF tactical bands so squad comms stay clear while jamming hostile FPV/loitering links.',
        costScrapAlloy: 45,
        costArmorUnits: 0,
        costControlChips: 3,
        fabricationTimeSec: 4.0,
        prerequisiteNodeIds: ['east-loot-citv-optics'],
        statModifiers: {
          vehicleMaxArmorBonus: 80,
          kineticMitigationBonus: 0.06,
          shapedChargeMitigationBonus: 0.12,
          apsInterceptCharges: 2,
          squadFirepowerMultiplier: 1.1,
          weaponConvergenceBonus: 0.1,
          chassisMassDeltaKg: 130,
        },
        visualMeshFlag: 'SQUAD_EXOS',
      },
    ];
  }

  // WEST Player Faction looting EAST Tech
  return [
    {
      id: 'west-loot-relikt-era',
      code: 'E-ARM-01',
      name: 'Captured 4S24 Relikt Soft-Case Heavy ERA',
      originFaction: FactionId.EAST,
      usableByFaction: FactionId.WEST,
      category: RetrofitCategory.VEHICLE_ARMOR,
      stage: RetrofitStage.SALVAGE_CAPTURED,
      sourceDescription:
        'Salvaged low-collateral 4S24 Relikt reactive cassettes from Eastern armored supply columns.',
      adapterEngineeringNote:
        'Bolts titanium-alloy shock-absorber cages onto Stryker ceramic appliqué lashing points to absorb flyer-plate impulse safely.',
      costScrapAlloy: 40,
      costArmorUnits: 2,
      costControlChips: 0,
      fabricationTimeSec: 3.5,
      prerequisiteNodeIds: [],
      statModifiers: {
        vehicleMaxArmorBonus: 440,
        kineticMitigationBonus: 0.18,
        shapedChargeMitigationBonus: 0.54,
        apsInterceptCharges: 0,
        squadFirepowerMultiplier: 1.0,
        weaponConvergenceBonus: 0,
        chassisMassDeltaKg: 1240,
      },
      visualMeshFlag: 'ERA_TILES',
    },
    {
      id: 'west-loot-arenam-aps',
      code: 'E-APS-02',
      name: 'Retrofitted Arena-M Doppler Hard-Kill APS Silos',
      originFaction: FactionId.EAST,
      usableByFaction: FactionId.WEST,
      category: RetrofitCategory.ACTIVE_PROTECTION,
      stage: RetrofitStage.LOCKED_UNSEEN,
      sourceDescription:
        'Recovered omnidirectional millimeter-wave radar & downward-firing fragmentation cassettes.',
      adapterEngineeringNote:
        'Integrates CAN-bus safety interlocks with Stryker RWS hatch sensors so dismounted Western infantry are masked during intercept.',
      costScrapAlloy: 55,
      costArmorUnits: 1,
      costControlChips: 2,
      fabricationTimeSec: 5.0,
      prerequisiteNodeIds: ['west-loot-relikt-era'],
      statModifiers: {
        vehicleMaxArmorBonus: 130,
        kineticMitigationBonus: 0.05,
        shapedChargeMitigationBonus: 0.15,
        apsInterceptCharges: 4,
        squadFirepowerMultiplier: 1.05,
        weaponConvergenceBonus: 0,
        chassisMassDeltaKg: 510,
      },
      visualMeshFlag: 'APS_RADAR',
    },
    {
      id: 'west-loot-sosna-optics',
      code: 'E-OPT-03',
      name: 'Sosna-U Dual-Channel Laser Beam-Riding Mast',
      originFaction: FactionId.EAST,
      usableByFaction: FactionId.WEST,
      category: RetrofitCategory.FIRE_CONTROL_OPTICS,
      stage: RetrofitStage.SALVAGE_CAPTURED,
      sourceDescription:
        'Captured stabilized thermal/autotracker assembly from Eastern fire-support vehicles.',
      adapterEngineeringNote:
        'Maps Russian autotracker telemetry packets onto NATO Vetronics FBCB2 tactical display.',
      costScrapAlloy: 30,
      costArmorUnits: 0,
      costControlChips: 2,
      fabricationTimeSec: 3.0,
      prerequisiteNodeIds: [],
      statModifiers: {
        vehicleMaxArmorBonus: 0,
        kineticMitigationBonus: 0,
        shapedChargeMitigationBonus: 0,
        apsInterceptCharges: 0,
        squadFirepowerMultiplier: 1.18,
        weaponConvergenceBonus: 0.25,
        chassisMassDeltaKg: 90,
      },
      visualMeshFlag: 'THERMAL_MAST',
    },
    {
      id: 'west-loot-kornet-turret',
      code: 'E-ORD-04',
      name: '9M133M-2 Kornet-EM Tandem Thermobaric Twin-Rail',
      originFaction: FactionId.EAST,
      usableByFaction: FactionId.WEST,
      category: RetrofitCategory.SQUAD_ORDNANCE,
      stage: RetrofitStage.LOCKED_UNSEEN,
      sourceDescription:
        'Salvaged long-range laser-beam-riding tandem ATGM launcher rails from heavy escort trucks.',
      adapterEngineeringNote:
        'Pairs Kornet-EM launch tubes onto M153 RWS elevation trunnion with custom optical encoder.',
      costScrapAlloy: 65,
      costArmorUnits: 2,
      costControlChips: 3,
      fabricationTimeSec: 5.5,
      prerequisiteNodeIds: ['west-loot-sosna-optics'],
      statModifiers: {
        vehicleMaxArmorBonus: 60,
        kineticMitigationBonus: 0.04,
        shapedChargeMitigationBonus: 0,
        apsInterceptCharges: 0,
        squadFirepowerMultiplier: 1.38,
        weaponConvergenceBonus: 0.15,
        chassisMassDeltaKg: 230,
      },
      visualMeshFlag: 'REMOTE_TURRET',
    },
    {
      id: 'west-loot-7n39-ammo',
      code: 'E-INF-05',
      name: 'Tungsten-Carbide Igolnik AP & Valday Squad Reflex Integration',
      originFaction: FactionId.EAST,
      usableByFaction: FactionId.WEST,
      category: RetrofitCategory.SQUAD_ORDNANCE,
      stage: RetrofitStage.SALVAGE_CAPTURED,
      sourceDescription:
        'Captured sealed zinc spam-cans of hardened tungsten-cobalt penetrator cores.',
      adapterEngineeringNote:
        'Swaps high-wear cobalt penetrator tips into NATO polymer-cased squad reloads for +35% armor defeat.',
      costScrapAlloy: 35,
      costArmorUnits: 1,
      costControlChips: 1,
      fabricationTimeSec: 2.5,
      prerequisiteNodeIds: [],
      statModifiers: {
        vehicleMaxArmorBonus: 0,
        kineticMitigationBonus: 0,
        shapedChargeMitigationBonus: 0,
        apsInterceptCharges: 0,
        squadFirepowerMultiplier: 1.24,
        weaponConvergenceBonus: 0.3,
        chassisMassDeltaKg: 0,
      },
      visualMeshFlag: 'HYBRID_AMMO',
    },
    {
      id: 'west-loot-volnorez-ew',
      code: 'E-EW-06',
      name: 'Rp-377UVM1L Lesochek Multi-Band Convoy EW Dome',
      originFaction: FactionId.EAST,
      usableByFaction: FactionId.WEST,
      category: RetrofitCategory.ELECTRONIC_WARFARE,
      stage: RetrofitStage.LOCKED_UNSEEN,
      sourceDescription:
        'Captured compact electronic warfare suppression dome from Eastern command transports.',
      adapterEngineeringNote:
        'Synchronizes blanking pulses with SINCGARS frequency-hopping tables to preserve squad voice net.',
      costScrapAlloy: 45,
      costArmorUnits: 0,
      costControlChips: 3,
      fabricationTimeSec: 4.0,
      prerequisiteNodeIds: ['west-loot-sosna-optics'],
      statModifiers: {
        vehicleMaxArmorBonus: 80,
        kineticMitigationBonus: 0.06,
        shapedChargeMitigationBonus: 0.12,
        apsInterceptCharges: 2,
        squadFirepowerMultiplier: 1.1,
        weaponConvergenceBonus: 0.1,
        chassisMassDeltaKg: 125,
      },
      visualMeshFlag: 'SQUAD_EXOS',
    },
  ];
}

export function canAdvanceRetrofitStage(
  node: RetrofitTechNode,
  allNodes: RetrofitTechNode[],
  inventory: SalvageInventory
): { allowed: boolean; reason: string } {
  if (node.stage === RetrofitStage.FIELD_RETROFITTED) {
    return { allowed: false, reason: 'Already field-retrofitted onto squad unit' };
  }

  for (const reqId of node.prerequisiteNodeIds) {
    const parent = allNodes.find((n) => n.id === reqId);
    if (!parent || parent.stage !== RetrofitStage.FIELD_RETROFITTED) {
      return {
        allowed: false,
        reason: `Requires ${parent?.name ?? reqId} retrofitted first`,
      };
    }
  }

  if (node.stage === RetrofitStage.LOCKED_UNSEEN) {
    return {
      allowed: false,
      reason: 'Ambush an enemy supply convoy or capture a depot crate to unlock blueprint',
    };
  }

  if (node.stage === RetrofitStage.SALVAGE_CAPTURED) {
    return { allowed: true, reason: 'Ready for Field Reverse-Engineering (free diagnostic scan)' };
  }

  if (node.stage === RetrofitStage.REVERSE_ENGINEERED) {
    const armorPool =
      node.originFaction === FactionId.WEST
        ? inventory.westernCompositePlates
        : inventory.easternEraBlocks;
    if (inventory.rawScrapAlloy < node.costScrapAlloy) {
      return {
        allowed: false,
        reason: `Need ${node.costScrapAlloy} Scrap Alloy (have ${inventory.rawScrapAlloy})`,
      };
    }
    if (armorPool < node.costArmorUnits) {
      return {
        allowed: false,
        reason: `Need ${node.costArmorUnits} Captured Armor Cassettes (have ${armorPool})`,
      };
    }
    if (inventory.encryptedFireControlChips < node.costControlChips) {
      return {
        allowed: false,
        reason: `Need ${node.costControlChips} Fire-Control Chips (have ${inventory.encryptedFireControlChips})`,
      };
    }
    return { allowed: true, reason: 'Fabricate Cross-Faction Mounting Adapter' };
  }

  if (node.stage === RetrofitStage.ADAPTER_FABRICATED) {
    return { allowed: true, reason: 'Install Field Retrofit onto Squad Vehicle' };
  }

  return { allowed: false, reason: 'Unavailable' };
}

export function advanceNodeAndRecalculateVehicle(
  targetNodeId: string,
  nodes: RetrofitTechNode[],
  inventory: SalvageInventory,
  currentVehicle: TacticalUnitVehicleState
): {
  nodes: RetrofitTechNode[];
  inventory: SalvageInventory;
  vehicle: TacticalUnitVehicleState;
  eventMessage: string;
} {
  const nextNodes = nodes.map((n) => ({ ...n }));
  const nextInv = { ...inventory };
  const idx = nextNodes.findIndex((n) => n.id === targetNodeId);
  if (idx === -1) {
    return { nodes: nextNodes, inventory: nextInv, vehicle: currentVehicle, eventMessage: 'Node not found' };
  }

  const node = nextNodes[idx];
  const check = canAdvanceRetrofitStage(node, nextNodes, nextInv);
  if (!check.allowed) {
    return { nodes: nextNodes, inventory: nextInv, vehicle: currentVehicle, eventMessage: check.reason };
  }

  let eventMessage = '';

  if (node.stage === RetrofitStage.SALVAGE_CAPTURED) {
    node.stage = RetrofitStage.REVERSE_ENGINEERED;
    eventMessage = `Reverse-engineered ${node.code}: ${node.name}. Cross-faction pinout & lug tolerances mapped.`;
  } else if (node.stage === RetrofitStage.REVERSE_ENGINEERED) {
    nextInv.rawScrapAlloy -= node.costScrapAlloy;
    if (node.originFaction === FactionId.WEST) {
      nextInv.westernCompositePlates -= node.costArmorUnits;
    } else {
      nextInv.easternEraBlocks -= node.costArmorUnits;
    }
    nextInv.encryptedFireControlChips -= node.costControlChips;
    node.stage = RetrofitStage.ADAPTER_FABRICATED;
    eventMessage = `Fabricated field adapter kit for ${node.name}. Ready to bolt onto ${currentVehicle.callsign}.`;
  } else if (node.stage === RetrofitStage.ADAPTER_FABRICATED) {
    node.stage = RetrofitStage.FIELD_RETROFITTED;
    // Unlock any child nodes whose prerequisites are now met so they become SALVAGE_CAPTURED if looted
    for (const child of nextNodes) {
      if (
        child.stage === RetrofitStage.LOCKED_UNSEEN &&
        child.prerequisiteNodeIds.includes(node.id)
      ) {
        child.stage = RetrofitStage.SALVAGE_CAPTURED;
      }
    }
    eventMessage = `RETROFIT COMPLETE: ${node.name} installed on ${currentVehicle.callsign} (${currentVehicle.chassisDesignation}).`;
  }

  const updatedVehicle = recalculateVehicleStats(currentVehicle, nextNodes);
  return {
    nodes: nextNodes,
    inventory: nextInv,
    vehicle: updatedVehicle,
    eventMessage,
  };
}

/**
 * One-click Convoy Crate Instant Field Retrofit helper for seamless 3D combat loop
 * as well as full step-by-step tech tree progression.
 */
export function applyConvoySalvageDrop(
  nodes: RetrofitTechNode[],
  inventory: SalvageInventory,
  playerFaction: FactionId
): {
  nodes: RetrofitTechNode[];
  inventory: SalvageInventory;
  summary: string;
} {
  const nextInv = { ...inventory };
  nextInv.rawScrapAlloy += 55;
  if (playerFaction === FactionId.EAST) {
    nextInv.westernCompositePlates += 3;
  } else {
    nextInv.easternEraBlocks += 3;
  }
  nextInv.encryptedFireControlChips += 2;
  nextInv.milStdBusAdapters += 1;

  const nextNodes = nodes.map((n) => {
    if (n.stage === RetrofitStage.LOCKED_UNSEEN && n.prerequisiteNodeIds.length === 0) {
      return { ...n, stage: RetrofitStage.SALVAGE_CAPTURED };
    }
    // Also unlock locked child nodes if parent is already retrofitted
    if (n.stage === RetrofitStage.LOCKED_UNSEEN) {
      const prereqsDone = n.prerequisiteNodeIds.every((pid) => {
        const p = nodes.find((cand) => cand.id === pid);
        return p && p.stage === RetrofitStage.FIELD_RETROFITTED;
      });
      if (prereqsDone) {
        return { ...n, stage: RetrofitStage.SALVAGE_CAPTURED };
      }
    }
    return { ...n };
  });

  const lootType =
    playerFaction === FactionId.EAST
      ? '+3 Western M19 ARAT-2 Cassettes, +2 MIL-STD Chips, +55 Alloy'
      : '+3 Eastern 4S24 Relikt Cassettes, +2 GOST Fire-Control Chips, +55 Alloy';

  return {
    nodes: nextNodes,
    inventory: nextInv,
    summary: `Convoy Supply Crate Looted: ${lootType}`,
  };
}

export function recalculateVehicleStats(
  current: TacticalUnitVehicleState,
  nodes: RetrofitTechNode[]
): TacticalUnitVehicleState {
  const base = createInitialVehicleState(current.faction);
  const hullRatio = current.hullHp / Math.max(1, current.maxHullHp);
  const armorRatio = current.armorPlatingHp / Math.max(1, current.maxArmorPlatingHp);

  let maxArmor = base.maxArmorPlatingHp;
  let kineticMit = base.kineticMitigation;
  let shapedMit = base.shapedChargeMitigation;
  let maxAps = base.maxApsCharges;
  let massKg = base.massKg;

  let hasEraTiles = false;
  let hasApsRadar = false;
  let hasThermalMast = false;
  let hasRemoteTurret = false;

  for (const node of nodes) {
    if (node.stage === RetrofitStage.FIELD_RETROFITTED) {
      maxArmor += node.statModifiers.vehicleMaxArmorBonus;
      kineticMit = Math.min(0.78, kineticMit + node.statModifiers.kineticMitigationBonus);
      shapedMit = Math.min(0.86, shapedMit + node.statModifiers.shapedChargeMitigationBonus);
      maxAps += node.statModifiers.apsInterceptCharges;
      massKg += node.statModifiers.chassisMassDeltaKg;

      if (node.visualMeshFlag === 'ERA_TILES') hasEraTiles = true;
      if (node.visualMeshFlag === 'APS_RADAR') hasApsRadar = true;
      if (node.visualMeshFlag === 'THERMAL_MAST') hasThermalMast = true;
      if (node.visualMeshFlag === 'REMOTE_TURRET') hasRemoteTurret = true;
    }
  }

  const armorGain = Math.max(0, maxArmor - current.maxArmorPlatingHp);

  return {
    ...current,
    maxArmorPlatingHp: maxArmor,
    armorPlatingHp: Math.min(
      maxArmor,
      Math.round(current.armorPlatingHp + armorGain > 0 ? current.armorPlatingHp + armorGain : maxArmor * armorRatio)
    ),
    hullHp: Math.round(base.maxHullHp * hullRatio),
    kineticMitigation: kineticMit,
    shapedChargeMitigation: shapedMit,
    maxApsCharges: maxAps,
    apsCharges: Math.max(current.apsCharges, maxAps),
    massKg,
    hasEraTiles,
    hasApsRadar,
    hasThermalMast,
    hasRemoteTurret,
  };
}
