/**
 * 魔塔社区连接诊断工具
 * 功能：通过发送真实消息来诊断魔塔社区连接问题
 * 描述：魔塔社区的最佳测试方式是直接发送一条消息，验证API地址、Token和模型ID是否都正确
 */

/**
 * 常见的魔塔社区模型 ID 列表
 */
export const COMMON_MODELSCOPE_MODELS = [
  // Qwen 系列（推荐）
  'Qwen/Qwen2.5-Coder-32B-Instruct',
  'Qwen/Qwen2.5-72B-Instruct',
  'Qwen/Qwen2.5-32B-Instruct',
  'Qwen/Qwen2.5-14B-Instruct',
  'Qwen/Qwen2.5-7B-Instruct',
  
  // DeepSeek 系列
  'deepseek-ai/DeepSeek-V3',
  'deepseek-ai/DeepSeek-V2.5',
  'deepseek-ai/deepseek-chat',
  'deepseek-ai/deepseek-coder',
  
  // Yi 系列
  'yi/Yi-Large',
  'yi/Yi-Medium',
  
  // ChatGLM 系列
  'zhipuai/chatglm3-6b',
  'zhipuai/glm-4',
];

interface DiagnosisResult {
  success: boolean;
  error?: string;
  details?: Record<string, unknown>;
  suggestions?: string[];
}

/**
 * 诊断魔塔社区连接
 * 通过发送一条真实的测试消息来验证连接
 */
export async function diagnoseModelScopeConnection(
  apiEndpoint: string,
  apiKey: string,
  modelId: string
): Promise<DiagnosisResult> {
  const result: DiagnosisResult = {
    success: false,
    suggestions: []
  };

  try {
    // 1. 检查基本参数
    if (!apiEndpoint || !apiKey || !modelId) {
      result.error = '缺少必要的配置参数';
      result.suggestions?.push('请确保已填写 API地址、API Token 和模型ID');
      return result;
    }

    console.log(`[ModelScope诊断] 开始诊断连接...`);
    console.log(`[ModelScope诊断] API地址: ${apiEndpoint}`);
    console.log(`[ModelScope诊断] 模型ID: ${modelId}`);
    console.log(`[ModelScope诊断] API Key: ${apiKey.substring(0, 10)}...`);

    // 2. 构建聊天端点
    const chatEndpoint = apiEndpoint.endsWith('/v1')
      ? `${apiEndpoint}/chat/completions`
      : `${apiEndpoint.replace(/\/$/, '')}/v1/chat/completions`;
    
    console.log(`[ModelScope诊断] 发送测试消息到: ${chatEndpoint}`);

    // 3. 发送一条真实的测试消息
    const testMessage = {
      model: modelId,
      messages: [
        {
          role: 'user',
          content: '你好'
        }
      ],
      max_tokens: 10,
      stream: false
    };

    console.log(`[ModelScope诊断] 测试请求体:`, testMessage);

    const response = await fetch(chatEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testMessage)
    });

    console.log(`[ModelScope诊断] 响应状态: ${response.status} ${response.statusText}`);

    // 4. 处理响应
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ModelScope诊断] 请求失败:`, errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      // 根据不同的错误状态码提供建议
      if (response.status === 401) {
        result.error = 'API Token 无效或已过期';
        result.suggestions?.push('请检查 API Token 是否正确');
        result.suggestions?.push('请确认 Token 是否有效且未过期');
        result.suggestions?.push('Token 获取地址: https://www.modelscope.cn/my/myaccesstoken');
      } else if (response.status === 403) {
        result.error = '没有权限访问该API或模型';
        result.suggestions?.push('请检查 API Token 的权限设置');
        result.suggestions?.push('请确认您的账号是否有权限使用该模型');
      } else if (response.status === 404) {
        result.error = `模型 "${modelId}" 不存在`;
        result.suggestions?.push(`模型 ID "${modelId}" 可能不正确`);
        result.suggestions?.push('请注意模型 ID 区分大小写');
        result.suggestions?.push('');
        result.suggestions?.push('请尝试以下常见模型 ID：');
        COMMON_MODELSCOPE_MODELS.slice(0, 5).forEach(model => {
          result.suggestions?.push(`  - ${model}`);
        });
      } else if (response.status === 429) {
        result.error = '请求频率过高，已被限流';
        result.suggestions?.push('请稍后再试');
      } else if (response.status >= 500) {
        result.error = '魔塔社区服务器错误';
        result.suggestions?.push('这是魔塔社区服务端的问题，请稍后再试');
      } else {
        const errorMessage = errorData.error?.message || errorData.message || `连接失败 (${response.status})`;
        result.error = errorMessage;
        
        // 如果错误信息包含模型相关的关键词
        if (errorMessage.includes('模型') || errorMessage.includes('model') || errorMessage.includes('Model')) {
          result.suggestions?.push('可能是模型 ID 不正确或该模型未启用');
          result.suggestions?.push('');
          result.suggestions?.push('推荐的模型 ID：');
          COMMON_MODELSCOPE_MODELS.slice(0, 3).forEach(model => {
            result.suggestions?.push(`  - ${model}`);
          });
        } else {
          result.suggestions?.push('请检查所有配置是否正确');
        }
      }

      result.details = {
        status: response.status,
        statusText: response.statusText,
        errorData
      };

      return result;
    }

    // 5. 解析成功响应
    const responseData = await response.json();
    console.log(`[ModelScope诊断] 连接成功！响应:`, responseData);

    // 提取响应内容
    const responseContent = responseData.choices?.[0]?.message?.content || '';
    console.log(`[ModelScope诊断] AI 回复: ${responseContent}`);

    result.success = true;
    result.details = {
      apiEndpoint,
      modelId,
      responsePreview: {
        id: responseData.id,
        model: responseData.model,
        content: responseContent.substring(0, 50) + (responseContent.length > 50 ? '...' : ''),
        hasChoices: responseData.choices && responseData.choices.length > 0
      }
    };

    result.suggestions?.push('✓ 连接测试成功！');
    result.suggestions?.push(`✓ 模型 "${modelId}" 可以正常使用`);

    return result;

  } catch (error) {
    console.error(`[ModelScope诊断] 诊断过程出错:`, error);
    
    result.error = error instanceof Error ? error.message : '未知错误';
    result.suggestions?.push('请检查网络连接');
    result.suggestions?.push('请确认 API 地址是否正确');
    result.suggestions?.push('标准 API 地址: https://api-inference.modelscope.cn/v1');
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      result.suggestions?.push('');
      result.suggestions?.push('可能的原因：');
      result.suggestions?.push('  - 网络连接问题');
      result.suggestions?.push('  - 被防火墙拦截');
      result.suggestions?.push('  - VPN或代理设置问题');
    }
    
    return result;
  }
}
