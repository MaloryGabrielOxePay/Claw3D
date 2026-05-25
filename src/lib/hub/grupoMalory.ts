export type HubAgentVisualState = "idle" | "working" | "called";

export type HubBrandKey = "wowlog" | "malory-connect" | "agencia-iai" | "oxepay";

export type HubLogoSlot = {
  label: string;
  src: string | null;
  alt: string;
};

export type HubBrand = {
  key: HubBrandKey;
  label: string;
  logo: HubLogoSlot;
  color: string;
  accent: string;
};

export type HubSector = {
  id: string;
  brand: HubBrandKey;
  label: string;
};

export type HubZone = {
  id: string;
  brand: HubBrandKey;
  label: string;
  sectors: HubSector[];
  color: string;
  accent: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type HubAgentActivity = {
  agentId: string;
  visualState: HubAgentVisualState;
  text: string;
  brand: HubBrandKey;
  sector: string;
};

export const HUB_GRUPO_MALORY_TITLE = "HUB Grupo Malory";

export const HUB_GRUPO_MALORY_LOGO: HubLogoSlot = {
  label: "HUB Grupo Malory",
  src: null,
  alt: "HUB Grupo Malory logo",
};

export const HUB_GRUPO_MALORY_LOGO_PLACEHOLDER =
  "/brand/grupo-malory/logos/README.md";

export const HUB_GRUPO_MALORY_BRANDS: Record<HubBrandKey, HubBrand> = {
  wowlog: {
    key: "wowlog",
    label: "wowlog",
    logo: {
      label: "wowlog",
      src: null,
      alt: "wowlog logo",
    },
    color: "#183f50",
    accent: "#86d7ff",
  },
  "malory-connect": {
    key: "malory-connect",
    label: "malory connect",
    logo: {
      label: "malory connect",
      src: null,
      alt: "malory connect logo",
    },
    color: "#43351d",
    accent: "#efc76f",
  },
  "agencia-iai": {
    key: "agencia-iai",
    label: "agencia iai",
    logo: {
      label: "agencia iai",
      src: null,
      alt: "agencia iai logo",
    },
    color: "#314635",
    accent: "#a7e0b4",
  },
  oxepay: {
    key: "oxepay",
    label: "oxepay",
    logo: {
      label: "oxepay",
      src: null,
      alt: "oxepay logo",
    },
    color: "#3f2630",
    accent: "#f1a6b8",
  },
};

export const HUB_GRUPO_MALORY_ZONES: HubZone[] = [
  {
    id: "wowlog",
    brand: "wowlog",
    label: HUB_GRUPO_MALORY_BRANDS.wowlog.label,
    color: HUB_GRUPO_MALORY_BRANDS.wowlog.color,
    accent: HUB_GRUPO_MALORY_BRANDS.wowlog.accent,
    x: 155,
    y: 150,
    w: 250,
    h: 145,
    sectors: [
      { id: "wowlog-dispatcher", brand: "wowlog", label: "Dispatcher" },
    ],
  },
  {
    id: "malory-connect",
    brand: "malory-connect",
    label: HUB_GRUPO_MALORY_BRANDS["malory-connect"].label,
    color: HUB_GRUPO_MALORY_BRANDS["malory-connect"].color,
    accent: HUB_GRUPO_MALORY_BRANDS["malory-connect"].accent,
    x: 470,
    y: 150,
    w: 300,
    h: 145,
    sectors: [
      {
        id: "connect-dispatcher",
        brand: "malory-connect",
        label: "Dispatcher",
      },
      { id: "connect-comercial", brand: "malory-connect", label: "Comercial" },
      {
        id: "connect-desenvolvedor",
        brand: "malory-connect",
        label: "Desenvolvedor",
      },
    ],
  },
  {
    id: "agencia-iai",
    brand: "agencia-iai",
    label: HUB_GRUPO_MALORY_BRANDS["agencia-iai"].label,
    color: HUB_GRUPO_MALORY_BRANDS["agencia-iai"].color,
    accent: HUB_GRUPO_MALORY_BRANDS["agencia-iai"].accent,
    x: 190,
    y: 435,
    w: 260,
    h: 150,
    sectors: [
      { id: "iai-marketing", brand: "agencia-iai", label: "Marketing" },
    ],
  },
  {
    id: "oxepay",
    brand: "oxepay",
    label: HUB_GRUPO_MALORY_BRANDS.oxepay.label,
    color: HUB_GRUPO_MALORY_BRANDS.oxepay.color,
    accent: HUB_GRUPO_MALORY_BRANDS.oxepay.accent,
    x: 520,
    y: 430,
    w: 320,
    h: 160,
    sectors: [
      { id: "oxepay-comercial", brand: "oxepay", label: "Comercial" },
      { id: "oxepay-financeiro", brand: "oxepay", label: "Financeiro" },
      { id: "oxepay-operacional", brand: "oxepay", label: "Operacional" },
      { id: "oxepay-pos-venda", brand: "oxepay", label: "Pos-venda" },
    ],
  },
];

export const HUB_GENERAL_MARKETING_ZONE = {
  label: "Marketing Grupo Malory",
  x: 425,
  y: 330,
  w: 290,
  h: 96,
  color: "#2d2a24",
  accent: "#d9b56c",
};

export const HUB_DEFAULT_AGENT_ACTIVITY: Record<string, HubAgentActivity> = {
  main: {
    agentId: "main",
    visualState: "called",
    text: "Orquestrando o HUB Grupo Malory",
    brand: "malory-connect",
    sector: "Coordenação",
  },
  malorynho: {
    agentId: "malorynho",
    visualState: "called",
    text: "Orquestrando o HUB Grupo Malory",
    brand: "malory-connect",
    sector: "Coordenação",
  },
  neto: {
    agentId: "neto",
    visualState: "working",
    text: "Ajustando campanha da oxepay",
    brand: "oxepay",
    sector: "Marketing Grupo Malory",
  },
  claudinha: {
    agentId: "claudinha",
    visualState: "working",
    text: "Atualizando integração da malory connect",
    brand: "malory-connect",
    sector: "Desenvolvedor",
  },
};

export const resolveHubAgentActivity = (
  agentId: string,
  agentName: string,
): HubAgentActivity | null => {
  const normalizedId = agentId.trim().toLowerCase();
  const normalizedName = agentName.trim().toLowerCase();
  return (
    HUB_DEFAULT_AGENT_ACTIVITY[normalizedId] ??
    HUB_DEFAULT_AGENT_ACTIVITY[normalizedName] ??
    null
  );
};
