"""
提示词链使用示例
"""
from prompts.manager import PromptManager
from prompts.chain import PromptChainBuilder


def example_create_chain():
    """创建提示词链示例"""
    print("=== 创建提示词链示例 ===")
    
    manager = PromptManager()
    
    # 使用构建器创建链
    chain = (manager.create_chain("expert_assistant")
             .add_role("你是一个专业的技术顾问", order=0)
             .add_instruction("请提供详细、准确的技术建议", order=10)
             .add_constraint("回答要简洁明了，不超过200字", order=20)
             .build())
    
    manager.register_chain(chain)
    
    print(f"提示词链: {chain.name}")
    print(f"组合后的提示词:\n{chain.get_combined()}")


def example_use_template():
    """使用模板示例"""
    print("\n=== 使用模板示例 ===")
    
    manager = PromptManager()
    
    # 获取模板
    template = manager.get_template("expert")
    print(f"专家模板: {template}")
    
    # 列出所有模板
    templates = manager.list_templates()
    print(f"可用模板: {', '.join(templates)}")


def example_chain_combination():
    """提示词链组合示例"""
    print("\n=== 提示词链组合示例 ===")
    
    manager = PromptManager()
    
    # 创建多个链
    role_chain = PromptChainBuilder("role").add_role("你是一个Python编程专家").build()
    instruction_chain = PromptChainBuilder("instruction").add_instruction("请用中文回答").build()
    
    manager.register_chain(role_chain)
    manager.register_chain(instruction_chain)
    
    # 组合使用
    combined = "\n\n".join([
        role_chain.get_combined(),
        instruction_chain.get_combined()
    ])
    
    print(f"组合后的提示词:\n{combined}")


def main():
    """运行所有示例"""
    example_create_chain()
    example_use_template()
    example_chain_combination()


if __name__ == "__main__":
    main()

