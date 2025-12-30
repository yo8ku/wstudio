/**
 * 团队协作类预设流程图模板
 * 包含：跨部门流程图、项目流程图、组织架构图等
 */

import type { MermaidTemplate } from './types';

export const teamCollaborationTemplates: MermaidTemplate[] = [
  {
    id: 'cross-department',
    name: '跨部门流程图',
    description: '展示多个部门之间的协作流程',
    code: `flowchart LR
    subgraph 产品部
        A[需求分析] --> B[产品设计]
    end
    subgraph 设计部
        B --> C[UI设计]
        C --> D[设计评审]
    end
    subgraph 开发部
        D --> E[前端开发]
        D --> F[后端开发]
        E --> G[联调测试]
        F --> G
    end
    subgraph 测试部
        G --> H[功能测试]
        H --> I[上线发布]
    end`,
  },
  {
    id: 'project-flow',
    name: '项目流程图',
    description: '标准项目开发流程',
    code: `flowchart TD
    A[项目启动] --> B[需求收集]
    B --> C[需求评审]
    C --> D{需求通过?}
    D -->|是| E[技术方案]
    D -->|否| B
    E --> F[开发实现]
    F --> G[代码评审]
    G --> H[测试验证]
    H --> I{测试通过?}
    I -->|是| J[上线部署]
    I -->|否| F
    J --> K[项目复盘]`,
  },
  {
    id: 'org-structure',
    name: '组织架构图',
    description: '公司或团队组织架构',
    code: `flowchart TB
    CEO[CEO] --> CTO[CTO]
    CEO --> CFO[CFO]
    CEO --> COO[COO]
    CTO --> Dev[开发部]
    CTO --> QA[测试部]
    CTO --> Ops[运维部]
    Dev --> FE[前端组]
    Dev --> BE[后端组]
    Dev --> Mobile[移动端组]
    CFO --> Finance[财务部]
    CFO --> HR[人力资源]
    COO --> Product[产品部]
    COO --> Design[设计部]
    COO --> Market[市场部]`,
  },
  {
    id: 'timeline',
    name: '阶段时间轴',
    description: '项目阶段时间规划',
    code: `flowchart LR
    subgraph Q1[第一季度]
        A1[需求调研] --> A2[方案设计]
    end
    subgraph Q2[第二季度]
        A2 --> B1[核心开发]
        B1 --> B2[内部测试]
    end
    subgraph Q3[第三季度]
        B2 --> C1[公测上线]
        C1 --> C2[迭代优化]
    end
    subgraph Q4[第四季度]
        C2 --> D1[正式发布]
        D1 --> D2[运营推广]
    end`,
  },
  {
    id: 'role-based',
    name: '分角色流程图',
    description: '按角色划分的工作流程',
    code: `flowchart TB
    subgraph 产品经理
        PM1[收集需求] --> PM2[编写PRD]
        PM2 --> PM3[需求评审]
    end
    subgraph 设计师
        PM3 --> D1[交互设计]
        D1 --> D2[视觉设计]
        D2 --> D3[设计走查]
    end
    subgraph 开发工程师
        D3 --> DEV1[技术评审]
        DEV1 --> DEV2[编码实现]
        DEV2 --> DEV3[自测联调]
    end
    subgraph 测试工程师
        DEV3 --> QA1[测试用例]
        QA1 --> QA2[执行测试]
        QA2 --> QA3[验收通过]
    end`,
  },
  {
    id: 'milestone',
    name: '项目里程碑',
    description: '项目关键里程碑节点',
    code: `flowchart LR
    M1((立项)) --> M2((需求冻结))
    M2 --> M3((设计完成))
    M3 --> M4((开发完成))
    M4 --> M5((测试完成))
    M5 --> M6((上线发布))
    M6 --> M7((项目结项))`,
  },
  {
    id: 'yearly-timeline',
    name: '年度时间轴',
    description: '年度工作计划时间轴',
    code: `flowchart LR
    subgraph 上半年
        direction TB
        J[1月-规划] --> F[2月-启动]
        F --> M[3月-开发]
        M --> A[4月-测试]
        A --> May[5月-优化]
        May --> Jun[6月-发布]
    end
    subgraph 下半年
        direction TB
        Jul[7月-运营] --> Aug[8月-迭代]
        Aug --> Sep[9月-扩展]
        Sep --> Oct[10月-优化]
        Oct --> Nov[11月-稳定]
        Nov --> Dec[12月-总结]
    end
    上半年 --> 下半年`,
  },
  {
    id: 'multi-condition',
    name: '多条件流程图',
    description: '包含多个判断条件的流程',
    code: `flowchart TD
    A[开始] --> B{用户类型?}
    B -->|新用户| C[注册流程]
    B -->|老用户| D[登录流程]
    C --> E{信息完整?}
    E -->|是| F[创建账户]
    E -->|否| G[补充信息]
    G --> E
    D --> H{密码正确?}
    H -->|是| I[进入系统]
    H -->|否| J{尝试次数?}
    J -->|<3次| D
    J -->|>=3次| K[账户锁定]
    F --> I
    I --> L[结束]`,
  },
  {
    id: 'product-roadmap',
    name: '产品路线图',
    description: '产品发展规划路线',
    code: `flowchart LR
    subgraph MVP[MVP阶段]
        V1[核心功能] --> V2[基础体验]
    end
    subgraph Growth[成长阶段]
        V2 --> V3[功能扩展]
        V3 --> V4[性能优化]
    end
    subgraph Mature[成熟阶段]
        V4 --> V5[生态建设]
        V5 --> V6[商业化]
    end
    subgraph Scale[规模化]
        V6 --> V7[平台化]
        V7 --> V8[国际化]
    end`,
  },
  {
    id: 'user-experience',
    name: '用户体验流程图',
    description: '用户使用产品的体验流程',
    code: `flowchart TD
    A[用户访问] --> B[首页浏览]
    B --> C{感兴趣?}
    C -->|是| D[注册/登录]
    C -->|否| E[离开]
    D --> F[功能探索]
    F --> G[核心操作]
    G --> H{满意?}
    H -->|是| I[持续使用]
    H -->|否| J[反馈问题]
    J --> K[问题解决]
    K --> G
    I --> L[推荐分享]
    L --> M[用户增长]`,
  },
  {
    id: 'competitive-analysis',
    name: '竞品分析',
    description: '竞品对比分析流程',
    code: `flowchart TB
    A[确定分析目标] --> B[选择竞品]
    B --> C[收集信息]
    C --> D1[功能对比]
    C --> D2[体验对比]
    C --> D3[价格对比]
    C --> D4[市场对比]
    D1 --> E[综合分析]
    D2 --> E
    D3 --> E
    D4 --> E
    E --> F[优劣势总结]
    F --> G[策略建议]
    G --> H[行动计划]`,
  },
  {
    id: 'business-architecture',
    name: '业务架构图',
    description: '企业业务架构全景',
    code: `flowchart TB
    subgraph 用户层
        U1[C端用户]
        U2[B端客户]
        U3[内部员工]
    end
    subgraph 渠道层
        C1[Web端]
        C2[移动端]
        C3[小程序]
        C4[API接口]
    end
    subgraph 业务层
        B1[用户服务]
        B2[订单服务]
        B3[支付服务]
        B4[营销服务]
    end
    subgraph 数据层
        D1[数据存储]
        D2[数据分析]
        D3[数据应用]
    end
    用户层 --> 渠道层
    渠道层 --> 业务层
    业务层 --> 数据层`,
  },
  {
    id: 'product-architecture',
    name: '产品架构图',
    description: '产品功能架构设计',
    code: `flowchart TB
    subgraph 展示层
        P1[首页]
        P2[列表页]
        P3[详情页]
        P4[个人中心]
    end
    subgraph 功能层
        F1[搜索功能]
        F2[筛选功能]
        F3[收藏功能]
        F4[分享功能]
        F5[评论功能]
    end
    subgraph 服务层
        S1[用户服务]
        S2[内容服务]
        S3[消息服务]
        S4[统计服务]
    end
    subgraph 基础层
        B1[账号体系]
        B2[权限管理]
        B3[配置中心]
        B4[日志系统]
    end
    展示层 --> 功能层
    功能层 --> 服务层
    服务层 --> 基础层`,
  },
];
