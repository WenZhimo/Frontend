<?php
/**
 * 默认的兜底模板文件 (Required by WordPress)
 */
get_header(); ?>

<div class="page-frame" style="background: #111; height: 100vh; display: flex; align-items: center; justify-content: center;">
    <div style="text-align: center; color: #fff; font-family: 'ZCOOLQingKeHuangYou-Regular', sans-serif;">
        <h1 style="font-size: 5rem; color: #cc0000; text-shadow: 0 0 10px red;">[ 警告：扇区未找到 ]</h1>
        <p style="font-size: 1.5rem; margin-top: 20px;">河童重工数据库中没有您要查询的档案记录。</p>
        <br>
        <a href="<?php echo home_url(); ?>" style="color: #988b32; text-decoration: none; border: 1px solid #988b32; padding: 10px 20px; transition: all 0.3s;">
            > 返回主控制台 <
        </a>
    </div>
</div>

<?php get_footer(); ?>