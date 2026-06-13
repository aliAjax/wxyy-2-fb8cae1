(function (global) {
  "use strict";

  const POLARIZATION_TYPES = ["单偏光", "正交偏光", "反射光"];

  const OBSERVATION_FEATURES = [
    {
      id: "color_colorless",
      category: "单偏光特征",
      label: "无色/白色",
      polarization: "单偏光",
      description: "矿物在单偏光下呈无色或白色"
    },
    {
      id: "color_gray",
      category: "单偏光特征",
      label: "灰色调",
      polarization: "单偏光",
      description: "矿物呈不同深浅的灰色"
    },
    {
      id: "color_pink",
      category: "单偏光特征",
      label: "粉红色/肉红色",
      polarization: "单偏光",
      description: "矿物呈粉红色或肉红色，常见于钾长石"
    },
    {
      id: "color_green",
      category: "单偏光特征",
      label: "绿色",
      polarization: "单偏光",
      description: "矿物呈绿色调，如绿泥石、辉石等"
    },
    {
      id: "color_brown",
      category: "单偏光特征",
      label: "褐色/棕黄色",
      polarization: "单偏光",
      description: "矿物呈褐色或棕黄色，如黑云母、橄榄石蚀变"
    },
    {
      id: "color_blue",
      category: "单偏光特征",
      label: "蓝色/紫蓝色",
      polarization: "单偏光",
      description: "矿物呈蓝色或紫蓝色，如蓝闪石、堇青石"
    },
    {
      id: "color_yellow",
      category: "单偏光特征",
      label: "淡黄色",
      polarization: "单偏光",
      description: "矿物呈淡黄色调"
    },
    {
      id: "pleochroism_strong",
      category: "单偏光特征",
      label: "多色性明显",
      polarization: "单偏光",
      description: "旋转物台时颜色变化显著"
    },
    {
      id: "pleochroism_weak",
      category: "单偏光特征",
      label: "多色性弱/无",
      polarization: "单偏光",
      description: "旋转物台时颜色无明显变化"
    },
    {
      id: "relief_high",
      category: "单偏光特征",
      label: "正高突起",
      polarization: "单偏光",
      description: "矿物边缘粗黑，糙面显著"
    },
    {
      id: "relief_medium",
      category: "单偏光特征",
      label: "正中突起",
      polarization: "单偏光",
      description: "矿物边缘和糙面较明显"
    },
    {
      id: "relief_low",
      category: "单偏光特征",
      label: "低突起",
      polarization: "单偏光",
      description: "矿物边缘细窄，糙面不明显"
    },
    {
      id: "cleavage_perfect",
      category: "单偏光特征",
      label: "解理极完全/完全",
      polarization: "单偏光",
      description: "解理纹细而密，连续贯通"
    },
    {
      id: "cleavage_two_directions",
      category: "单偏光特征",
      label: "两组解理",
      polarization: "单偏光",
      description: "可见两个方向的解理纹"
    },
    {
      id: "cleavage_one_direction",
      category: "单偏光特征",
      label: "一组解理",
      polarization: "单偏光",
      description: "仅见一个方向的解理纹"
    },
    {
      id: "cleavage_none",
      category: "单偏光特征",
      label: "无解理/裂纹",
      polarization: "单偏光",
      description: "矿物颗粒完整，无明显解理"
    },
    {
      id: "crystal_form_euhedral",
      category: "单偏光特征",
      label: "自形晶",
      polarization: "单偏光",
      description: "晶形完整，规则多面体形态"
    },
    {
      id: "crystal_form_subhedral",
      category: "单偏光特征",
      label: "半自形晶",
      polarization: "单偏光",
      description: "部分晶面发育，形态较规则"
    },
    {
      id: "crystal_form_anhedral",
      category: "单偏光特征",
      label: "它形晶",
      polarization: "单偏光",
      description: "无规则晶面，呈不规则粒状"
    },
    {
      id: "inclusion_rich",
      category: "单偏光特征",
      label: "含包裹体",
      polarization: "单偏光",
      description: "矿物内部含有大量包裹体或杂质"
    },
    {
      id: "alteration_present",
      category: "单偏光特征",
      label: "蚀变现象",
      polarization: "单偏光",
      description: "矿物边缘或内部有次生蚀变"
    },
    {
      id: "opaque",
      category: "单偏光特征",
      label: "不透明",
      polarization: "反射光",
      description: "不透光，反射光下可见金属光泽"
    },
    {
      id: "extinction_parallel",
      category: "正交偏光特征",
      label: "平行消光",
      polarization: "正交偏光",
      description: "消光位与解理纹或晶棱平行"
    },
    {
      id: "extinction_inclined",
      category: "正交偏光特征",
      label: "斜消光",
      polarization: "正交偏光",
      description: "消光位与解理纹或晶棱斜交"
    },
    {
      id: "extinction_symmetrical",
      category: "正交偏光特征",
      label: "对称消光",
      polarization: "正交偏光",
      description: "两组解理夹角的平分线与十字丝平行时消光"
    },
    {
      id: "extinction_undulose",
      category: "正交偏光特征",
      label: "波状消光",
      polarization: "正交偏光",
      description: "消光带呈波浪状移动，常见于应变矿物"
    },
    {
      id: "extinction_uneven",
      category: "正交偏光特征",
      label: "不均匀消光",
      polarization: "正交偏光",
      description: "同一颗粒不同部位消光不一致"
    },
    {
      id: "interference_color_gray_white",
      category: "正交偏光特征",
      label: "灰-白干涉色(I级)",
      polarization: "正交偏光",
      description: "I级干涉色，暗灰至灰白色"
    },
    {
      id: "interference_color_yellow_red",
      category: "正交偏光特征",
      label: "黄-橙-红干涉色(I级)",
      polarization: "正交偏光",
      description: "I级黄至I级紫红"
    },
    {
      id: "interference_color_blue_green",
      category: "正交偏光特征",
      label: "蓝-绿干涉色(II级)",
      polarization: "正交偏光",
      description: "II级蓝至II级绿"
    },
    {
      id: "interference_color_high_order",
      category: "正交偏光特征",
      label: "高级白干涉色",
      polarization: "正交偏光",
      description: "干涉色呈亮白色，似珍珠光泽"
    },
    {
      id: "interference_color_anomalous",
      category: "正交偏光特征",
      label: "异常干涉色",
      polarization: "正交偏光",
      description: "出现不正常的蓝灰、铁锈褐色等"
    },
    {
      id: "twinning_present",
      category: "正交偏光特征",
      label: "可见双晶",
      polarization: "正交偏光",
      description: "颗粒内可见双晶纹或不同消光区"
    },
    {
      id: "twinning_carlsbad",
      category: "正交偏光特征",
      label: "卡斯巴双晶",
      polarization: "正交偏光",
      description: "简单接触双晶，常见于长石类"
    },
    {
      id: "twinning_polysynthetic",
      category: "正交偏光特征",
      label: "聚片双晶",
      polarization: "正交偏光",
      description: "多条细密平行的双晶纹"
    },
    {
      id: "isotropic",
      category: "正交偏光特征",
      label: "均质体（全消光）",
      polarization: "正交偏光",
      description: "旋转物台始终黑暗"
    },
    {
      id: "uniaxial",
      category: "正交偏光特征",
      label: "一轴晶",
      polarization: "正交偏光",
      description: "锥光下显示一轴晶干涉图"
    },
    {
      id: "biaxial",
      category: "正交偏光特征",
      label: "二轴晶",
      polarization: "正交偏光",
      description: "锥光下显示二轴晶干涉图"
    },
    {
      id: "zoning_present",
      category: "正交偏光特征",
      label: "环带构造",
      polarization: "正交偏光",
      description: "颗粒内部显示同心环带状消光"
    },
    {
      id: "texture_granular",
      category: "结构特征",
      label: "粒状结构",
      polarization: "单偏光",
      description: "主要由粒状矿物组成"
    },
    {
      id: "texture_porphyritic",
      category: "结构特征",
      label: "斑状结构",
      polarization: "单偏光",
      description: "基质中分布较大斑晶"
    },
    {
      id: "texture_fragmental",
      category: "结构特征",
      label: "碎裂结构",
      polarization: "单偏光",
      description: "颗粒有破碎裂纹、位移现象"
    },
    {
      id: "texture_foliated",
      category: "结构特征",
      label: "片状/定向排列",
      polarization: "单偏光",
      description: "片状/柱状矿物呈定向排列"
    },
    {
      id: "texture_fine_grained",
      category: "结构特征",
      label: "细粒/隐晶质",
      polarization: "单偏光",
      description: "颗粒细小，肉眼难分辨矿物成分"
    },
    {
      id: "texture_coarse_grained",
      category: "结构特征",
      label: "粗粒/等粒",
      polarization: "单偏光",
      description: "颗粒粗大且粒度均匀"
    },
    {
      id: "texture_interstitial",
      category: "结构特征",
      label: "填隙结构",
      polarization: "单偏光",
      description: "矿物颗粒间有胶结物充填"
    }
  ];

  const MINERAL_RULES = [
    {
      id: "quartz",
      name: "石英",
      formula: "SiO₂",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_colorless", "relief_low", "pleochroism_weak", "extinction_undulose", "interference_color_gray_white", "cleavage_none", "crystal_form_anhedral"],
        mustHave: ["color_colorless", "interference_color_gray_white", "cleavage_none"],
        keywords: ["石英", "qtz", "quartz", "波状消光", "粒状"],
        excludeKeywords: ["方解石", "长石"]
      },
      description: "低突起，无色，无解理，I级灰白干涉色，常具波状消光，粒状或它形",
      commonAssociations: ["长石", "云母", "绿泥石"],
      confirmTests: ["观察波状消光", "检查无解理特征", "确认低突起"]
    },
    {
      id: "k_feldspar",
      name: "钾长石",
      formula: "KAlSi₃O₈",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_pink", "color_colorless", "relief_low", "pleochroism_weak", "cleavage_two_directions", "twinning_carlsbad", "extinction_uneven", "alteration_present"],
        mustHave: ["cleavage_two_directions"],
        keywords: ["钾长石", "kfs", "k-feldspar", "正长石", "微斜长石", "条纹", "卡斯巴", "肉红"],
        excludeKeywords: ["斜长石", "石英"]
      },
      description: "低突起，两组解理近直交，常见卡斯巴双晶，可呈肉红色，易高岭土化",
      commonAssociations: ["石英", "斜长石", "黑云母"],
      confirmTests: ["确认卡斯巴双晶", "观察两组解理", "检查蚀变产物（高岭土）"]
    },
    {
      id: "plagioclase",
      name: "斜长石",
      formula: "NaAlSi₃O₈-CaAl₂Si₂O₈",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_colorless", "relief_medium", "relief_low", "pleochroism_weak", "cleavage_two_directions", "twinning_polysynthetic", "zoning_present", "extinction_inclined"],
        mustHave: ["twinning_polysynthetic"],
        keywords: ["斜长石", "plag", "plagioclase", "钠长石", "更长石", "中长石", "聚片", "环带", "双晶"],
        excludeKeywords: ["钾长石", "石英"]
      },
      description: "低-中正突起，两组解理，特征聚片双晶，可具环带构造，斜消光",
      commonAssociations: ["钾长石", "石英", "辉石", "角闪石"],
      confirmTests: ["观察聚片双晶纹", "检查环带构造", "测量消光角判断牌号"]
    },
    {
      id: "biotite",
      name: "黑云母",
      formula: "K(Mg,Fe)₃AlSi₃O₁₀(OH)₂",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_brown", "color_green", "pleochroism_strong", "relief_medium", "cleavage_one_direction", "crystal_form_euhedral", "extinction_parallel", "interference_color_yellow_red"],
        mustHave: ["pleochroism_strong", "cleavage_one_direction"],
        keywords: ["黑云母", "bt", "biotite", "云母", "片状", "多色性", "棕色"],
        excludeKeywords: ["白云母", "绿泥石"]
      },
      description: "片状，一组极完全解理，棕-绿色多色性显著，I级黄-红干涉色，近平行消光",
      commonAssociations: ["石英", "长石", "角闪石", "石榴石"],
      confirmTests: ["观察显著多色性", "确认片状晶形和解理", "检查近平行消光"]
    },
    {
      id: "muscovite",
      name: "白云母",
      formula: "KAl₂(AlSi₃O₁₀)(OH)₂",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_colorless", "pleochroism_weak", "relief_low", "cleavage_one_direction", "crystal_form_euhedral", "extinction_parallel", "interference_color_blue_green"],
        mustHave: ["color_colorless", "cleavage_one_direction"],
        keywords: ["白云母", "ms", "muscovite", "云母", "片状", "无色"],
        excludeKeywords: ["黑云母", "绿泥石"]
      },
      description: "无色片状，一组极完全解理，II级蓝-绿干涉色，平行消光，无多色性",
      commonAssociations: ["石英", "长石", "黑云母", "石榴石"],
      confirmTests: ["确认无色无多色性", "观察II级蓝-绿干涉色", "检查片状晶形"]
    },
    {
      id: "chlorite",
      name: "绿泥石",
      formula: "(Mg,Fe)₃(Si,Al)₄O₁₀(OH)₂·(Mg,Fe)₃(OH)₆",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_green", "pleochroism_weak", "pleochroism_strong", "relief_low", "cleavage_one_direction", "interference_color_anomalous", "extinction_parallel", "crystal_form_subhedral"],
        mustHave: ["color_green"],
        keywords: ["绿泥石", "chl", "chlorite", "绿色", "片状", "异常干涉色", "蚀变"],
        excludeKeywords: ["黑云母", "角闪石"]
      },
      description: "绿色片状，弱多色性，常见异常蓝灰/铁锈褐干涉色，近于平行消光",
      commonAssociations: ["石英", "长石", "绿帘石", "方解石"],
      confirmTests: ["观察异常干涉色", "确认绿色调", "检查多色性特征"]
    },
    {
      id: "calcite",
      name: "方解石",
      formula: "CaCO₃",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_colorless", "relief_medium", "cleavage_perfect", "extinction_symmetrical", "interference_color_high_order", "crystal_form_subhedral"],
        mustHave: ["cleavage_perfect", "interference_color_high_order"],
        keywords: ["方解石", "cal", "calcite", "碳酸盐", "石灰石", "高级白", "三组解理"],
        excludeKeywords: ["石英", "长石"]
      },
      description: "三组完全解理，高级白干涉色，对称消光，遇稀盐酸起泡",
      commonAssociations: ["白云石", "绿泥石", "石英"],
      confirmTests: ["观察三组菱形解理", "确认高级白干涉色", "检查对称消光"]
    },
    {
      id: "amphibole",
      name: "角闪石",
      formula: "Ca₂(Mg,Fe)₅Si₈O₂₂(OH)₂",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_green", "color_brown", "pleochroism_strong", "relief_medium", "relief_high", "cleavage_two_directions", "crystal_form_euhedral", "extinction_inclined", "interference_color_yellow_red"],
        mustHave: ["cleavage_two_directions", "pleochroism_strong"],
        keywords: ["角闪石", "amp", "amphibole", "普通角闪石", "长柱状", "菱形", "绿色", "多色性"],
        excludeKeywords: ["辉石", "黑云母"]
      },
      description: "长柱状/菱形横切面，两组解理夹角约56°/124°，绿-褐色多色性，斜消光",
      commonAssociations: ["斜长石", "辉石", "磁铁矿", "石英"],
      confirmTests: ["测量两组解理夹角（约56°）", "观察长柱状晶形", "检查多色性公式"]
    },
    {
      id: "pyroxene",
      name: "辉石",
      formula: "XY(Si,Al)₂O₆",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_colorless", "color_green", "relief_high", "pleochroism_weak", "cleavage_two_directions", "crystal_form_subhedral", "crystal_form_euhedral", "extinction_parallel", "extinction_inclined", "interference_color_yellow_red", "interference_color_blue_green"],
        mustHave: ["cleavage_two_directions", "relief_high"],
        keywords: ["辉石", "px", "pyroxene", "普通辉石", "紫苏辉石", "短柱状", "高突起"],
        excludeKeywords: ["角闪石", "橄榄石"]
      },
      description: "短柱状/近正方形横切面，两组解理夹角约87°/93°，高突起，弱多色性",
      commonAssociations: ["斜长石", "角闪石", "橄榄石", "磁铁矿"],
      confirmTests: ["测量两组解理夹角（近90°）", "确认高突起", "观察短柱状晶形"]
    },
    {
      id: "garnet",
      name: "石榴石",
      formula: "X₃Y₂(SiO₄)₃",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_pink", "color_brown", "color_colorless", "relief_high", "isotropic", "crystal_form_euhedral", "cleavage_none", "inclusion_rich"],
        mustHave: ["isotropic", "relief_high"],
        keywords: ["石榴石", "grt", "garnet", "铁铝榴石", "均质体", "高突起", "全消光"],
        excludeKeywords: ["辉石"]
      },
      description: "高正突起，均质体（全消光），晶形完好（菱形/粒状），无解理，常含包裹体",
      commonAssociations: ["白云母", "黑云母", "石英", "蓝晶石"],
      confirmTests: ["旋转物台观察全消光", "确认高突起", "检查晶形特征"]
    },
    {
      id: "olivine",
      name: "橄榄石",
      formula: "(Mg,Fe)₂SiO₄",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_colorless", "color_yellow", "relief_high", "pleochroism_weak", "cleavage_none", "alteration_present", "crystal_form_subhedral", "interference_color_blue_green"],
        mustHave: ["relief_high", "cleavage_none"],
        keywords: ["橄榄石", "ol", "olivine", "高镁", "蚀变", "蛇纹石", "粒状", "无色"],
        excludeKeywords: ["石英", "辉石"]
      },
      description: "高正突起，无色-淡黄色，它形-半自形粒状，解理不发育，II级干涉色，易蚀变为蛇纹石",
      commonAssociations: ["辉石", "斜长石", "磁铁矿"],
      confirmTests: ["确认高突起且无解理", "检查II级干涉色", "观察是否有蛇纹石蚀变"]
    },
    {
      id: "epidote",
      name: "绿帘石",
      formula: "Ca₂(Al,Fe)₃(SiO₄)₃(OH)",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_yellow", "color_green", "pleochroism_weak", "relief_high", "relief_medium", "cleavage_one_direction", "interference_color_anomalous", "crystal_form_subhedral"],
        mustHave: ["relief_high"],
        keywords: ["绿帘石", "ep", "epidote", "黄绿色", "多色性", "蚀变", "柱状"],
        excludeKeywords: ["绿泥石", "角闪石"]
      },
      description: "高突起，淡黄-黄绿色，弱多色性，柱面一组解理，高干涉色（异常）",
      commonAssociations: ["绿泥石", "方解石", "钠长石"],
      confirmTests: ["观察黄绿-淡黄色调", "确认高突起", "检查高干涉色特征"]
    },
    {
      id: "magnetite",
      name: "磁铁矿",
      formula: "Fe₃O₄",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "反射光"],
        features: ["opaque", "crystal_form_euhedral", "isotropic"],
        mustHave: ["opaque"],
        keywords: ["磁铁矿", "mt", "magnetite", "不透明", "金属", "反射光", "八面体"],
        excludeKeywords: []
      },
      description: "不透明矿物，单偏光下全黑，反射光下呈灰白色金属光泽，等轴晶系",
      commonAssociations: ["辉石", "角闪石", "橄榄石", "长石"],
      confirmTests: ["反射光下观察金属光泽", "检查八面体晶形", "确认不透明特征"]
    },
    {
      id: "serpentine",
      name: "蛇纹石",
      formula: "Mg₃Si₂O₅(OH)₄",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_green", "color_yellow", "pleochroism_weak", "relief_low", "alteration_present", "crystal_form_anhedral", "interference_color_gray_white"],
        mustHave: ["color_green"],
        keywords: ["蛇纹石", "srp", "serpentine", "蚀变", "橄榄石", "绿色", "纤维状", "网状"],
        excludeKeywords: ["绿泥石", "角闪石"]
      },
      description: "橄榄石等蚀变产物，淡绿-黄绿色，低突起，常呈纤维状/网状，I级灰白干涉色",
      commonAssociations: ["橄榄石（蚀变前）", "方解石", "磁铁矿"],
      confirmTests: ["观察是否由橄榄石蚀变而来", "确认低突起", "检查纤维状结构"]
    },
    {
      id: "kaolinite",
      name: "高岭石",
      formula: "Al₄(Si₄O₁₀)(OH)₈",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_colorless", "relief_low", "alteration_present", "crystal_form_anhedral", "interference_color_gray_white", "texture_fine_grained"],
        mustHave: ["alteration_present"],
        keywords: ["高岭石", "kln", "kaolinite", "蚀变", "长石", "粘土", "隐晶质", "细粒"],
        excludeKeywords: ["绢云母"]
      },
      description: "长石蚀变产物，无色，低突起，细粒隐晶质集合体，I级灰白干涉色",
      commonAssociations: ["钾长石（蚀变前）", "石英", "方解石"],
      confirmTests: ["观察是否为长石蚀变产物", "确认细粒隐晶质结构", "检查低突起特征"]
    },
    {
      id: "dolomite",
      name: "白云石",
      formula: "CaMg(CO₃)₂",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_colorless", "relief_medium", "cleavage_perfect", "interference_color_high_order", "crystal_form_euhedral", "crystal_form_subhedral", "extinction_symmetrical", "extinction_inclined"],
        mustHave: ["cleavage_perfect", "interference_color_high_order"],
        keywords: ["白云石", "dol", "dolomite", "碳酸盐", "菱形", "高级白"],
        excludeKeywords: ["方解石"]
      },
      description: "三组完全解理，高级白干涉色，晶形较完整（菱形），与方解石需染色区分",
      commonAssociations: ["方解石", "绿泥石", "石英"],
      confirmTests: ["观察菱形晶形", "确认三组解理和高级白干涉色", "尝试茜素红染色区分方解石"]
    },
    {
      id: "fluorite",
      name: "萤石",
      formula: "CaF₂",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_colorless", "color_pink", "color_blue", "color_green", "relief_low", "cleavage_perfect", "isotropic", "crystal_form_euhedral"],
        mustHave: ["isotropic", "cleavage_perfect"],
        keywords: ["萤石", "fl", "fluorite", "均质体", "全消光", "四组解理"],
        excludeKeywords: ["石榴石"]
      },
      description: "均质体（全消光），低突起，四组完全解理，可呈紫色/绿色/无色",
      commonAssociations: ["方解石", "石英", "白云石"],
      confirmTests: ["旋转物台确认全消光", "观察四组解理", "检查低突起区别于石榴石"]
    },
    {
      id: "tourmaline",
      name: "电气石",
      formula: "Na(Mg,Fe,Li,Al)₃Al₆(BO₃)₃Si₆O₁₈(OH,F)₄",
      confidence: 0,
      conditions: {
        polarization: ["单偏光", "正交偏光"],
        features: ["color_pink", "color_green", "color_blue", "color_brown", "pleochroism_strong", "relief_medium", "relief_low", "cleavage_one_direction", "cleavage_none", "crystal_form_euhedral", "extinction_parallel", "interference_color_blue_green", "interference_color_yellow_red"],
        mustHave: ["pleochroism_strong", "crystal_form_euhedral"],
        keywords: ["电气石", "tourmaline", "tur", "碧玺", "柱状", "多色性强", "吸收性"],
        excludeKeywords: ["角闪石", "黑云母"]
      },
      description: "三方晶系柱状晶体，横切面球面三角形，强多色性/吸收性，平行消光",
      commonAssociations: ["石英", "白云母", "黄玉"],
      confirmTests: ["观察球面三角形横切面", "检查强多色性和吸收性", "确认平行消光"]
    }
  ];

  const ROCK_ASSOCIATION_RULES = [
    {
      id: "granite",
      name: "花岗岩/花岗质岩石",
      minerals: ["quartz", "k_feldspar", "plagioclase", "biotite", "muscovite"],
      keywords: ["花岗岩", "花岗", "酸性", "granite"],
      description: "石英+钾长石+斜长石为主要组成，含少量黑云母或白云母"
    },
    {
      id: "diorite",
      name: "闪长岩/安山岩类",
      minerals: ["plagioclase", "amphibole", "biotite", "pyroxene", "quartz"],
      keywords: ["闪长岩", "安山岩", "中性", "diorite", "andesite"],
      description: "中性斜长石为主，含角闪石、黑云母，石英可有可无"
    },
    {
      id: "gabbro",
      name: "辉长岩/玄武岩类",
      minerals: ["plagioclase", "pyroxene", "olivine", "magnetite", "amphibole"],
      keywords: ["辉长岩", "玄武岩", "基性", "gabbro", "basalt"],
      description: "基性斜长石+辉石为主，可含橄榄石和磁铁矿"
    },
    {
      id: "peridotite",
      name: "橄榄岩/超基性岩",
      minerals: ["olivine", "pyroxene", "serpentine", "magnetite"],
      keywords: ["橄榄岩", "超基性", "超镁铁", "peridotite"],
      description: "橄榄石+辉石为主，常蚀变为蛇纹石"
    },
    {
      id: "schist",
      name: "片岩类",
      minerals: ["muscovite", "biotite", "chlorite", "quartz", "plagioclase", "garnet", "amphibole"],
      keywords: ["片岩", "schist", "变质", "云母片岩", "绿泥片岩"],
      description: "片状矿物（云母、绿泥石、角闪石）定向排列为特征"
    },
    {
      id: "gneiss",
      name: "片麻岩类",
      minerals: ["quartz", "k_feldspar", "plagioclase", "biotite", "muscovite", "garnet"],
      keywords: ["片麻岩", "gneiss", "变质", "条带"],
      description: "长石+石英为主，暗色矿物呈条带状分布"
    },
    {
      id: "marble",
      name: "大理岩/碳酸盐岩",
      minerals: ["calcite", "dolomite", "serpentine", "epidote", "chlorite"],
      keywords: ["大理岩", "marble", "石灰岩", "碳酸盐", "灰岩"],
      description: "方解石/白云石为主，可含蛇纹石、绿泥石等变质矿物"
    },
    {
      id: "sandstone",
      name: "砂岩类",
      minerals: ["quartz", "k_feldspar", "plagioclase", "calcite", "muscovite", "chlorite"],
      keywords: ["砂岩", "sandstone", "沉积", "碎屑", "胶结"],
      description: "石英为主，含长石、岩屑，有胶结物"
    },
    {
      id: "serpentinite",
      name: "蛇纹岩",
      minerals: ["serpentine", "olivine", "pyroxene", "magnetite", "calcite"],
      keywords: ["蛇纹岩", "serpentinite", "蚀变", "超基性"],
      description: "几乎全由蛇纹石组成，为超基性岩蚀变产物"
    }
  ];

  function getFeaturesByCategory() {
    const grouped = {};
    OBSERVATION_FEATURES.forEach((f) => {
      if (!grouped[f.category]) grouped[f.category] = [];
      grouped[f.category].push(f);
    });
    return grouped;
  }

  function getFeatureById(id) {
    return OBSERVATION_FEATURES.find((f) => f.id === id) || null;
  }

  function getMineralById(id) {
    return MINERAL_RULES.find((m) => m.id === id) || null;
  }

  function inferMinerals(input) {
    const {
      polarization = "",
      primaryMinerals = "",
      texture = "",
      comment = "",
      selectedFeatures = []
    } = input;

    const allText = [primaryMinerals, texture, comment].join(" ").toLowerCase();

    const results = MINERAL_RULES.map((rule) => {
      let score = 0;
      const matches = [];
      const missing = [];
      const excluded = false;

      if (rule.conditions.polarization && polarization) {
        if (rule.conditions.polarization.includes(polarization)) {
          score += 5;
          matches.push(`偏光类型匹配（${polarization}）`);
        }
      }

      if (rule.conditions.mustHave && rule.conditions.mustHave.length > 0) {
        rule.conditions.mustHave.forEach((mf) => {
          if (selectedFeatures.includes(mf)) {
            score += 15;
            const feat = getFeatureById(mf);
            matches.push(`必要特征：${feat ? feat.label : mf}`);
          } else {
            missing.push(mf);
          }
        });
      }

      if (rule.conditions.features && rule.conditions.features.length > 0) {
        rule.conditions.features.forEach((fid) => {
          if (selectedFeatures.includes(fid) && !rule.conditions.mustHave?.includes(fid)) {
            score += 8;
            const feat = getFeatureById(fid);
            matches.push(`特征匹配：${feat ? feat.label : fid}`);
          }
        });
      }

      if (rule.conditions.keywords && rule.conditions.keywords.length > 0) {
        rule.conditions.keywords.forEach((kw) => {
          if (allText.includes(kw.toLowerCase())) {
            score += 12;
            matches.push(`关键词匹配：${kw}`);
          }
        });
      }

      if (rule.conditions.excludeKeywords && rule.conditions.excludeKeywords.length > 0) {
        rule.conditions.excludeKeywords.forEach((kw) => {
          if (allText.includes(kw.toLowerCase())) {
            score -= 10;
          }
        });
      }

      const maxPossibleScore = 5 + (rule.conditions.mustHave?.length || 0) * 15 +
        (rule.conditions.features?.length || 0) * 8 + (rule.conditions.keywords?.length || 0) * 12;
      const confidencePercent = maxPossibleScore > 0 ? Math.min(100, Math.round((score / maxPossibleScore) * 100)) : 0;

      return {
        id: rule.id,
        name: rule.name,
        formula: rule.formula,
        score,
        confidence: confidencePercent,
        matches,
        missing: missing.map((m) => getFeatureById(m)?.label || m),
        description: rule.description,
        confirmTests: rule.confirmTests || [],
        commonAssociations: rule.commonAssociations || []
      };
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);

    return results;
  }

  function inferRockAssociations(inferredMinerals, keywordsText) {
    const mineralIds = inferredMinerals.map((m) => m.id);
    const text = keywordsText.toLowerCase();

    return ROCK_ASSOCIATION_RULES.map((rule) => {
      let matchedCount = 0;
      rule.minerals.forEach((mid) => {
        if (mineralIds.includes(mid)) matchedCount++;
      });
      let keywordScore = 0;
      rule.keywords.forEach((kw) => {
        if (text.includes(kw.toLowerCase())) keywordScore += 10;
      });
      const coverage = rule.minerals.length > 0 ? matchedCount / rule.minerals.length : 0;
      const score = matchedCount * 15 + keywordScore;
      return {
        id: rule.id,
        name: rule.name,
        matchedMinerals: rule.minerals.filter((mid) => mineralIds.includes(mid)).map((mid) => getMineralById(mid)?.name || mid),
        coverage: Math.round(coverage * 100),
        score,
        description: rule.description
      };
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  }

  function generateSuggestions(inferredMinerals, input) {
    const suggestions = [];
    const selectedFeatures = input.selectedFeatures || [];
    const polarization = input.polarization || "";

    if (selectedFeatures.length === 0) {
      suggestions.push({
        type: "general",
        priority: "high",
        text: "请勾选观察特征以获得更准确的鉴定辅助",
        details: `可在下方特征列表中勾选已观察到的特征，包括${polarization ? `当前偏光类型「${polarization}」下的` : ''}颜色、突起、解理、干涉色、消光类型等`
      });
    }

    if (!polarization) {
      suggestions.push({
        type: "missing",
        priority: "high",
        text: "偏光类型未选择",
        details: "请先确定观察时使用的偏光类型（单偏光/正交偏光/反射光），这对矿物鉴定至关重要"
      });
    }

    const topMinerals = inferredMinerals.slice(0, 3);
    if (topMinerals.length === 0) {
      suggestions.push({
        type: "tip",
        priority: "medium",
        text: "暂无匹配矿物，请补充观察信息",
        details: "建议：记录颜色、突起等级、解理组数、干涉色级别、消光类型等关键特征"
      });
    } else {
      topMinerals.forEach((mineral, idx) => {
        if (mineral.confidence < 40 && mineral.missing.length > 0) {
          suggestions.push({
            type: "confirm",
            priority: idx === 0 ? "high" : "medium",
            text: `「${mineral.name}」待确认特征`,
            details: `建议补充观察：${mineral.missing.join("、")}。鉴定要点：${mineral.description}`
          });
        }
        if (mineral.confirmTests && mineral.confirmTests.length > 0) {
          mineral.confirmTests.slice(0, 2).forEach((test) => {
            suggestions.push({
              type: "test",
              priority: idx === 0 ? "high" : "low",
              text: `「${mineral.name}」验证：${test}`,
              details: `这是确认${mineral.name}（${mineral.formula}）的关键步骤`
            });
          });
        }
      });
    }

    const mineralPairs = [];
    for (let i = 0; i < topMinerals.length; i++) {
      for (let j = i + 1; j < topMinerals.length; j++) {
        mineralPairs.push([topMinerals[i], topMinerals[j]]);
      }
    }
    mineralPairs.slice(0, 2).forEach(([m1, m2]) => {
      suggestions.push({
        type: "differentiate",
        priority: "medium",
        text: `区分「${m1.name}」和「${m2.name}」`,
        details: `${m1.name}：${m1.description}\n${m2.name}：${m2.description}\n注意对比两者关键差异`
      });
    });

    return suggestions.sort((a, b) => {
      const priOrder = { high: 0, medium: 1, low: 2 };
      return (priOrder[a.priority] || 2) - (priOrder[b.priority] || 2);
    });
  }

  function analyzeSample(sample) {
    const input = {
      polarization: sample.polarization || "",
      primaryMinerals: sample.minerals || "",
      texture: sample.texture || "",
      comment: sample.comment || "",
      selectedFeatures: sample.observationFeatures || []
    };

    const inferredMinerals = inferMinerals(input);
    const keywordsText = [sample.minerals, sample.texture, sample.comment].join(" ");
    const rockAssociations = inferRockAssociations(inferredMinerals, keywordsText);
    const suggestions = generateSuggestions(inferredMinerals, input);

    return {
      inferredMinerals,
      rockAssociations,
      suggestions,
      confidenceLevel: inferredMinerals.length > 0 ? inferredMinerals[0].confidence : 0
    };
  }

  function getMineralSuggestionHTML(analysis) {
    if (!analysis) return "";

    const { inferredMinerals, rockAssociations, suggestions } = analysis;
    const topMinerals = inferredMinerals.slice(0, 5);

    let mineralsHTML = "";
    if (topMinerals.length > 0) {
      mineralsHTML = `
        <div class="ma-section">
          <h4 class="ma-section-title">🔍 可能的矿物（按匹配度）</h4>
          <div class="ma-mineral-list">
            ${topMinerals.map((m) => {
              const barColor = m.confidence >= 70 ? "var(--success)" : m.confidence >= 40 ? "var(--warning)" : "var(--muted)";
              return `
                <div class="ma-mineral-card">
                  <div class="ma-mineral-head">
                    <span class="ma-mineral-name">${m.name}</span>
                    <span class="ma-mineral-formula">${m.formula}</span>
                    <span class="ma-mineral-confidence" style="color:${barColor}">${m.confidence}%</span>
                  </div>
                  <div class="ma-conf-bar">
                    <div class="ma-conf-fill" style="width:${m.confidence}%;background:${barColor}"></div>
                  </div>
                  <p class="ma-mineral-desc">${m.description}</p>
                  ${m.matches.length > 0 ? `<div class="ma-match-list"><span class="ma-match-label">匹配：</span>${m.matches.slice(0, 3).map((mm) => `<span class="ma-match-tag">${mm}</span>`).join("")}</div>` : ""}
                  ${m.missing.length > 0 ? `<div class="ma-missing-list"><span class="ma-missing-label">待确认：</span>${m.missing.map((mm) => `<span class="ma-missing-tag">${mm}</span>`).join("")}</div>` : ""}
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;
    }

    let rocksHTML = "";
    if (rockAssociations.length > 0) {
      rocksHTML = `
        <div class="ma-section">
          <h4 class="ma-section-title">🪨 可能的岩石组合</h4>
          <div class="ma-rock-list">
            ${rockAssociations.slice(0, 3).map((r) => `
              <div class="ma-rock-card">
                <div class="ma-rock-head">
                  <span class="ma-rock-name">${r.name}</span>
                  <span class="ma-rock-coverage">矿物覆盖 ${r.coverage}%</span>
                </div>
                <p class="ma-rock-desc">${r.description}</p>
                <div class="ma-rock-minerals">已匹配：${r.matchedMinerals.join("、")}</div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    let suggestionsHTML = "";
    if (suggestions.length > 0) {
      suggestionsHTML = `
        <div class="ma-section">
          <h4 class="ma-section-title">💡 补充观察建议</h4>
          <div class="ma-suggestion-list">
            ${suggestions.slice(0, 6).map((s) => {
              const iconMap = {
                high: "⚠️",
                medium: "ℹ️",
                low: "💭"
              };
              const typeClass = `ma-sug-${s.type}`;
              return `
                <div class="ma-suggestion ${typeClass} ma-pri-${s.priority}">
                  <div class="ma-sug-head">
                    <span class="ma-sug-icon">${iconMap[s.priority] || "💡"}</span>
                    <span class="ma-sug-text">${s.text}</span>
                  </div>
                  ${s.details ? `<p class="ma-sug-details">${s.details.replace(/\n/g, "<br>")}</p>` : ""}
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;
    }

    const disclaimer = `
      <div class="ma-disclaimer">
        <span class="ma-disc-icon">ℹ️</span>
        <span>以上为本地规则推断辅助，不能替代老师鉴定结论。最终结果以专业鉴定为准。</span>
      </div>
    `;

    return mineralsHTML + rocksHTML + suggestionsHTML + disclaimer;
  }

  function getObservationFeaturesHTML(selectedIds = [], polarization = "") {
    const grouped = getFeaturesByCategory();
    let html = '<div class="ma-features-container">';

    Object.entries(grouped).forEach(([category, features]) => {
      const filteredFeatures = polarization
        ? features.filter((f) => f.polarization === polarization || f.polarization === "单偏光")
        : features;
      if (filteredFeatures.length === 0) return;

      html += `
        <div class="ma-feature-category">
          <h5 class="ma-feature-cat-title">${category}</h5>
          <div class="ma-feature-grid">
            ${filteredFeatures.map((f) => `
              <label class="ma-feature-item" title="${f.description}">
                <input type="checkbox" class="ma-feature-checkbox" value="${f.id}" ${selectedIds.includes(f.id) ? "checked" : ""}>
                <span class="ma-feature-label">${f.label}</span>
              </label>
            `).join("")}
          </div>
        </div>
      `;
    });

    html += "</div>";
    return html;
  }

  global.MineralAssistant = {
    POLARIZATION_TYPES,
    OBSERVATION_FEATURES,
    MINERAL_RULES,
    ROCK_ASSOCIATION_RULES,
    getFeaturesByCategory,
    getFeatureById,
    getMineralById,
    inferMinerals,
    inferRockAssociations,
    generateSuggestions,
    analyzeSample,
    getMineralSuggestionHTML,
    getObservationFeaturesHTML
  };

})(window);
