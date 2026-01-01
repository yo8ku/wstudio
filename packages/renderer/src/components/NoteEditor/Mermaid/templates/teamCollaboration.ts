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
    subgraph Product[产品部]
        A[需求分析]:::blue --> B[产品设计]:::blue
    end
    subgraph Design[设计部]
        C[UI设计]:::green --> D[设计评审]:::green
    end
    subgraph Dev[开发部]
        E[开发实现]:::orange --> F[联调测试]:::orange
    end
    B --> C
    D --> E
    classDef blue fill:#4ECDC4,stroke:#26A69A,color:#fff
    classDef green fill:#66BB6A,stroke:#43A047,color:#fff
    classDef orange fill:#FFA726,stroke:#FB8C00,color:#fff`,
  },
  {
    id: 'project-flow',
    name: '项目流程图',
    description: '标准项目开发流程',
    code: `flowchart TD
    A[项目启动]:::startNode --> B[需求收集]:::blue
    B --> C[需求评审]:::blue
    C --> D{是否通过}:::decision
    D -->|是| E[技术方案]:::green
    D -->|否| B
    E --> F[开发实现]:::green
    F --> G[代码评审]:::orange
    G --> H[测试验证]:::orange
    H --> I{是否通过}:::decision
    I -->|是| J[上线部署]:::purple
    I -->|否| F
    J --> K[项目复盘]:::endNode
    classDef startNode fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef endNode fill:#9C27B0,stroke:#7B1FA2,color:#fff
    classDef blue fill:#42A5F5,stroke:#1E88E5,color:#fff
    classDef green fill:#66BB6A,stroke:#43A047,color:#fff
    classDef orange fill:#FFA726,stroke:#FB8C00,color:#fff
    classDef purple fill:#AB47BC,stroke:#8E24AA,color:#fff
    classDef decision fill:#FFEE58,stroke:#FDD835,color:#333`,
  },
  {
    id: 'org-structure',
    name: '组织架构图',
    description: '公司或团队组织架构',
    code: `flowchart TB
    A[CEO]:::ceo --> B[CTO]:::tech
    A --> C[CFO]:::finance
    A --> D[COO]:::ops
    B --> E[开发部]:::tech
    B --> F[测试部]:::tech
    C --> G[财务部]:::finance
    C --> H[人力资源]:::finance
    D --> I[产品部]:::ops
    D --> J[市场部]:::ops
    classDef ceo fill:#E91E63,stroke:#C2185B,color:#fff
    classDef tech fill:#2196F3,stroke:#1976D2,color:#fff
    classDef finance fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef ops fill:#FF9800,stroke:#F57C00,color:#fff`,
  },
  {
    id: 'timeline',
    name: '阶段时间轴',
    description: '项目阶段时间规划',
    code: `flowchart LR
    subgraph Q1[第一季度]
        A1[需求调研]:::q1 --> A2[方案设计]:::q1
    end
    subgraph Q2[第二季度]
        B1[核心开发]:::q2 --> B2[内部测试]:::q2
    end
    subgraph Q3[第三季度]
        C1[公测上线]:::q3 --> C2[迭代优化]:::q3
    end
    subgraph Q4[第四季度]
        D1[正式发布]:::q4 --> D2[运营推广]:::q4
    end
    A2 --> B1
    B2 --> C1
    C2 --> D1
    classDef q1 fill:#E91E63,stroke:#C2185B,color:#fff
    classDef q2 fill:#2196F3,stroke:#1976D2,color:#fff
    classDef q3 fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef q4 fill:#FF9800,stroke:#F57C00,color:#fff`,
  },
  {
    id: 'role-based',
    name: '分角色流程图',
    description: '按角色划分的工作流程',
    code: `flowchart TB
    subgraph PM[产品经理]
        A1[收集需求]:::pm --> A2[编写PRD]:::pm
    end
    subgraph Designer[设计师]
        B1[交互设计]:::design --> B2[视觉设计]:::design
    end
    subgraph Developer[开发]
        C1[技术评审]:::dev --> C2[编码实现]:::dev
    end
    subgraph Tester[测试]
        D1[测试用例]:::test --> D2[执行测试]:::test
    end
    A2 --> B1
    B2 --> C1
    C2 --> D1
    classDef pm fill:#9C27B0,stroke:#7B1FA2,color:#fff
    classDef design fill:#E91E63,stroke:#C2185B,color:#fff
    classDef dev fill:#2196F3,stroke:#1976D2,color:#fff
    classDef test fill:#4CAF50,stroke:#388E3C,color:#fff`,
  },
  {
    id: 'milestone',
    name: '项目里程碑',
    description: '项目关键里程碑节点',
    code: `flowchart LR
    M1((立项)):::m1 --> M2((需求冻结)):::m2
    M2 --> M3((设计完成)):::m3
    M3 --> M4((开发完成)):::m4
    M4 --> M5((测试完成)):::m5
    M5 --> M6((上线发布)):::m6
    M6 --> M7((项目结项)):::m7
    classDef m1 fill:#E91E63,stroke:#C2185B,color:#fff
    classDef m2 fill:#9C27B0,stroke:#7B1FA2,color:#fff
    classDef m3 fill:#673AB7,stroke:#512DA8,color:#fff
    classDef m4 fill:#2196F3,stroke:#1976D2,color:#fff
    classDef m5 fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef m6 fill:#FF9800,stroke:#F57C00,color:#fff
    classDef m7 fill:#F44336,stroke:#D32F2F,color:#fff`,
  },
  {
    id: 'multi-condition',
    name: '多条件流程图',
    description: '包含多个判断条件的流程',
    code: `flowchart TD
    A[开始]:::startNode --> B{用户类型}:::decision
    B -->|新用户| C[注册流程]:::blue
    B -->|老用户| D[登录流程]:::green
    C --> E{信息完整}:::decision
    E -->|是| F[创建账户]:::blue
    E -->|否| G[补充信息]:::orange
    G --> E
    D --> H{密码正确}:::decision
    H -->|是| I[进入系统]:::green
    H -->|否| J{尝试次数}:::decision
    J -->|少于3次| D
    J -->|超过3次| K[账户锁定]:::red
    F --> I
    I --> L[结束]:::endNode
    classDef startNode fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef endNode fill:#9C27B0,stroke:#7B1FA2,color:#fff
    classDef blue fill:#42A5F5,stroke:#1E88E5,color:#fff
    classDef green fill:#66BB6A,stroke:#43A047,color:#fff
    classDef orange fill:#FFA726,stroke:#FB8C00,color:#fff
    classDef red fill:#EF5350,stroke:#E53935,color:#fff
    classDef decision fill:#FFEE58,stroke:#FDD835,color:#333`,
  },
  {
    id: 'user-experience',
    name: '用户体验流程图',
    description: '用户使用产品的体验流程',
    code: `flowchart TD
    A[用户访问]:::startNode --> B[首页浏览]:::blue
    B --> C{感兴趣}:::decision
    C -->|是| D[注册登录]:::green
    C -->|否| E[离开]:::red
    D --> F[功能探索]:::green
    F --> G[核心操作]:::blue
    G --> H{满意}:::decision
    H -->|是| I[持续使用]:::purple
    H -->|否| J[反馈问题]:::orange
    J --> K[问题解决]:::orange
    K --> G
    I --> L[推荐分享]:::purple
    L --> M[用户增长]:::endNode
    classDef startNode fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef endNode fill:#9C27B0,stroke:#7B1FA2,color:#fff
    classDef blue fill:#42A5F5,stroke:#1E88E5,color:#fff
    classDef green fill:#66BB6A,stroke:#43A047,color:#fff
    classDef orange fill:#FFA726,stroke:#FB8C00,color:#fff
    classDef red fill:#EF5350,stroke:#E53935,color:#fff
    classDef purple fill:#AB47BC,stroke:#8E24AA,color:#fff
    classDef decision fill:#FFEE58,stroke:#FDD835,color:#333`,
  },
  {
    id: 'sprint-planning',
    name: 'Sprint规划',
    description: '敏捷开发Sprint规划流程',
    code: `flowchart TD
    A[产品待办列表]:::startNode --> B[Sprint规划会议]:::blue
    B --> C[确定Sprint目标]:::blue
    C --> D[任务拆分]:::green
    D --> E[工时估算]:::green
    E --> F[Sprint待办列表]:::orange
    F --> G[每日站会]:::orange
    G --> H{Sprint进行中}:::decision
    H --> I[开发实现]:::purple
    I --> J[代码评审]:::purple
    J --> K[测试验证]:::purple
    K --> L[Sprint评审]:::endNode
    classDef startNode fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef endNode fill:#9C27B0,stroke:#7B1FA2,color:#fff
    classDef blue fill:#42A5F5,stroke:#1E88E5,color:#fff
    classDef green fill:#66BB6A,stroke:#43A047,color:#fff
    classDef orange fill:#FFA726,stroke:#FB8C00,color:#fff
    classDef purple fill:#AB47BC,stroke:#8E24AA,color:#fff
    classDef decision fill:#FFEE58,stroke:#FDD835,color:#333`,
  },
  {
    id: 'code-review',
    name: '代码评审流程',
    description: '团队代码评审标准流程',
    code: `flowchart TD
    A[提交代码]:::blue --> B[创建合并请求]:::blue
    B --> C[自动化检查]:::blue
    C --> D{检查通过}:::decision
    D -->|否| E[修复问题]:::red
    E --> A
    D -->|是| F[分配评审人]:::green
    F --> G[代码评审]:::green
    G --> H{评审通过}:::decision
    H -->|否| I[提出修改意见]:::orange
    I --> J[修改代码]:::orange
    J --> G
    H -->|是| K[批准合并]:::purple
    K --> L[合并主分支]:::purple
    L --> M[自动部署]:::green
    classDef blue fill:#42A5F5,stroke:#1E88E5,color:#fff
    classDef green fill:#66BB6A,stroke:#43A047,color:#fff
    classDef orange fill:#FFA726,stroke:#FB8C00,color:#fff
    classDef red fill:#EF5350,stroke:#E53935,color:#fff
    classDef purple fill:#AB47BC,stroke:#8E24AA,color:#fff
    classDef decision fill:#FFEE58,stroke:#FDD835,color:#333`,
  },
  {
    id: 'incident-response',
    name: '故障响应流程',
    description: '线上故障响应处理流程',
    code: `flowchart TD
    A[故障告警]:::red --> B[值班人员响应]:::orange
    B --> C[初步判断]:::orange
    C --> D{严重程度}:::decision
    D -->|P0| E[全员响应]:::red
    D -->|P1| F[核心人员响应]:::orange
    D -->|P2| G[常规处理]:::blue
    E --> H[紧急修复]:::purple
    F --> H
    G --> H
    H --> I[验证修复]:::green
    I --> J{修复成功}:::decision
    J -->|否| H
    J -->|是| K[故障恢复]:::green
    K --> L[编写复盘报告]:::endNode
    classDef red fill:#EF5350,stroke:#E53935,color:#fff
    classDef orange fill:#FFA726,stroke:#FB8C00,color:#fff
    classDef blue fill:#42A5F5,stroke:#1E88E5,color:#fff
    classDef green fill:#66BB6A,stroke:#43A047,color:#fff
    classDef purple fill:#AB47BC,stroke:#8E24AA,color:#fff
    classDef endNode fill:#9C27B0,stroke:#7B1FA2,color:#fff
    classDef decision fill:#FFEE58,stroke:#FDD835,color:#333`,
  },
  {
    id: 'onboarding',
    name: '新人入职流程',
    description: '新员工入职引导流程',
    code: `flowchart TD
    A[入职报到]:::startNode --> B[办理手续]:::blue
    B --> C[领取设备]:::blue
    C --> D[环境配置]:::blue
    D --> E[导师分配]:::green
    E --> F[团队介绍]:::green
    F --> G[业务培训]:::orange
    G --> H[技术培训]:::orange
    H --> I[熟悉代码]:::purple
    I --> J[小任务练手]:::purple
    J --> K{通过评审}:::decision
    K -->|否| L[导师指导]:::orange
    L --> J
    K -->|是| M[正式参与项目]:::endNode
    classDef startNode fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef endNode fill:#9C27B0,stroke:#7B1FA2,color:#fff
    classDef blue fill:#42A5F5,stroke:#1E88E5,color:#fff
    classDef green fill:#66BB6A,stroke:#43A047,color:#fff
    classDef orange fill:#FFA726,stroke:#FB8C00,color:#fff
    classDef purple fill:#AB47BC,stroke:#8E24AA,color:#fff
    classDef decision fill:#FFEE58,stroke:#FDD835,color:#333`,
  },
  {
    id: 'release-process',
    name: '发布流程',
    description: '软件发布上线流程',
    code: `flowchart TD
    A[功能开发完成]:::startNode --> B[提测]:::blue
    B --> C[测试环境部署]:::blue
    C --> D[功能测试]:::green
    D --> E{测试通过}:::decision
    E -->|否| F[修复Bug]:::red
    F --> D
    E -->|是| G[预发布环境]:::orange
    G --> H[回归测试]:::orange
    H --> I[产品验收]:::purple
    I --> J{验收通过}:::decision
    J -->|否| K[问题修复]:::red
    K --> H
    J -->|是| L[发布审批]:::purple
    L --> M[生产环境部署]:::endNode
    classDef startNode fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef endNode fill:#9C27B0,stroke:#7B1FA2,color:#fff
    classDef blue fill:#42A5F5,stroke:#1E88E5,color:#fff
    classDef green fill:#66BB6A,stroke:#43A047,color:#fff
    classDef orange fill:#FFA726,stroke:#FB8C00,color:#fff
    classDef red fill:#EF5350,stroke:#E53935,color:#fff
    classDef purple fill:#AB47BC,stroke:#8E24AA,color:#fff
    classDef decision fill:#FFEE58,stroke:#FDD835,color:#333`,
  },
  {
    id: 'meeting-flow',
    name: '会议流程',
    description: '高效会议组织流程',
    code: `flowchart TD
    A[确定会议目标]:::startNode --> B[准备议程]:::blue
    B --> C[邀请参会人]:::blue
    C --> D[发送会议通知]:::blue
    D --> E[会前准备]:::green
    E --> F[开始会议]:::green
    F --> G[主持人开场]:::orange
    G --> H[议题讨论]:::orange
    H --> I[记录要点]:::orange
    I --> J[形成决议]:::purple
    J --> K[分配任务]:::purple
    K --> L[会议总结]:::endNode
    classDef startNode fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef endNode fill:#9C27B0,stroke:#7B1FA2,color:#fff
    classDef blue fill:#42A5F5,stroke:#1E88E5,color:#fff
    classDef green fill:#66BB6A,stroke:#43A047,color:#fff
    classDef orange fill:#FFA726,stroke:#FB8C00,color:#fff
    classDef purple fill:#AB47BC,stroke:#8E24AA,color:#fff`,
  },
  {
    id: 'feedback-loop',
    name: '反馈闭环',
    description: '用户反馈处理闭环流程',
    code: `flowchart TD
    A[收集反馈]:::startNode --> B[分类整理]:::blue
    B --> C{反馈类型}:::decision
    C -->|Bug| D[创建Bug单]:::red
    C -->|需求| E[需求评估]:::green
    C -->|建议| F[记录建议]:::orange
    D --> G[开发修复]:::purple
    E --> H{是否采纳}:::decision
    H -->|是| I[排入计划]:::green
    H -->|否| J[说明原因]:::orange
    F --> K[定期评审]:::blue
    G --> L[测试验证]:::purple
    I --> L
    L --> M[上线发布]:::endNode
    classDef startNode fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef endNode fill:#9C27B0,stroke:#7B1FA2,color:#fff
    classDef blue fill:#42A5F5,stroke:#1E88E5,color:#fff
    classDef green fill:#66BB6A,stroke:#43A047,color:#fff
    classDef orange fill:#FFA726,stroke:#FB8C00,color:#fff
    classDef red fill:#EF5350,stroke:#E53935,color:#fff
    classDef purple fill:#AB47BC,stroke:#8E24AA,color:#fff
    classDef decision fill:#FFEE58,stroke:#FDD835,color:#333`,
  },
  {
    id: 'knowledge-sharing',
    name: '知识分享流程',
    description: '团队知识分享机制',
    code: `flowchart TD
    A[确定分享主题]:::startNode --> B[准备材料]:::blue
    B --> C[内部评审]:::blue
    C --> D{质量达标}:::decision
    D -->|否| E[完善内容]:::orange
    E --> C
    D -->|是| F[安排分享时间]:::green
    F --> G[发布通知]:::green
    G --> H[进行分享]:::purple
    H --> I[互动问答]:::purple
    I --> J[收集反馈]:::orange
    J --> K[整理文档]:::blue
    K --> L[归档知识库]:::endNode
    classDef startNode fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef endNode fill:#9C27B0,stroke:#7B1FA2,color:#fff
    classDef blue fill:#42A5F5,stroke:#1E88E5,color:#fff
    classDef green fill:#66BB6A,stroke:#43A047,color:#fff
    classDef orange fill:#FFA726,stroke:#FB8C00,color:#fff
    classDef purple fill:#AB47BC,stroke:#8E24AA,color:#fff
    classDef decision fill:#FFEE58,stroke:#FDD835,color:#333`,
  },
];
