#!/usr/bin/env python3
"""
自动化脚本：从所有 .scss 文件中移除颜色样式并添加 import

功能：
1. 扫描所有 .scss 文件
2. 在文件顶部添加 @import colors.css（如果还没有）
3. 移除颜色相关的 CSS 属性
"""

import os
import re
from pathlib import Path

# 需要移除的颜色相关属性
COLOR_PROPS = [
    r'background-color\s*:',
    r'background\s*:\s*(?!none|transparent)',
    r'color\s*:',
    r'border-color\s*:',
    r'border-top-color\s*:',
    r'border-right-color\s*:',
    r'border-bottom-color\s*:',
    r'border-left-color\s*:',
    r'box-shadow\s*:',
    r'fill\s*:',
    r'stroke\s*:',
    r'opacity\s*:\s*(?!1\b)',
]

def calculate_import_path(file_path):
    """计算相对于 styles/colors.css 的导入路径"""
    base = Path('packages/renderer/src')
    file_dir = Path(file_path).parent
    
    # 计算相对路径
    try:
        rel_path = file_dir.relative_to(base)
        depth = len(rel_path.parts)
        return f"{'../' * depth}styles/colors.css"
    except ValueError:
        return '../../../styles/colors.css'

def should_remove_line(line):
    """判断是否应该移除这一行"""
    line = line.strip()
    
    # 跳过注释
    if line.startswith('//') or line.startswith('/*'):
        return False
    
    # 保留特殊情况
    if 'background: none' in line or 'background: transparent' in line:
        return False
    if 'border: none' in line:
        return False
    if re.search(r'border.*:\s*\d+px\s+solid\s*;', line):
        return False
    
    # 检查是否包含颜色属性
    for pattern in COLOR_PROPS:
        if re.search(pattern, line):
            return True
    
    return False

def process_file(file_path):
    """处理单个文件"""
    print(f"Processing: {file_path}")
    
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    
    new_lines = []
    has_import = False
    has_header = False
    
    for line in lines:
        # 检查是否已有 import
        if '@import' in line and 'colors.css' in line:
            has_import = True
            new_lines.append(line)
            continue
        
        # 检查是否有注释头
        if '只负责布局' in line or '颜色样式在' in line:
            has_header = True
        
        # 移除颜色相关的行
        if should_remove_line(line):
            continue
        
        new_lines.append(line)
    
    # 添加 import（如果还没有）
    if not has_import:
        import_path = calculate_import_path(file_path)
        component_name = Path(file_path).parent.name
        
        header = f"""/**
 * {component_name} 样式 - 只负责布局
 * 颜色样式在 colors.css 中统一管理
 */
@import '{import_path}';

"""
        # 找到第一个非注释行
        insert_pos = 0
        for i, line in enumerate(new_lines):
            stripped = line.strip()
            if stripped and not stripped.startswith('//') and not stripped.startswith('/*') and not stripped.startswith('*'):
                insert_pos = i
                break
        
        # 移除旧的注释头
        if has_header:
            # 简单处理：直接在顶部插入
            new_lines.insert(0, header)
        else:
            new_lines.insert(insert_pos, header)
    
    # 写回文件
    with open(file_path, 'w', encoding='utf-8', newline='\n') as f:
        f.writelines(new_lines)
    
    print(f"✓ {file_path}")

def main():
    """主函数"""
    base_path = Path('packages/renderer/src')
    scss_files = list(base_path.glob('**/*.scss'))
    
    print(f"Found {len(scss_files)} SCSS files\n")
    
    for file_path in scss_files:
        try:
            process_file(str(file_path))
        except Exception as e:
            print(f"Error processing {file_path}: {e}")
    
    print(f"\n✓ All done! Processed {len(scss_files)} files")

if __name__ == '__main__':
    main()

