<?php
/**
 * 专属通讯接口模板：comments.php
 */

// 拦截非法直接访问
if ( post_password_required() ) {
    return;
}
?>

<div id="comments" class="terminal-comments-area">

    <?php if ( have_comments() ) : ?>
    <h2 class="comments-title">
        [ 历史通讯记录 / LOGS ]：共拦截到 <?php echo get_comments_number(); ?> 条数据
    </h2>

    <ol class="comment-list">
        <?php
            // 调用 WP 原生的评论列表，但后续我们会用 CSS 给它穿上装甲
            wp_list_comments( array(
                'style'       => 'ol',
                'short_ping'  => true,
                'avatar_size' => 42,
            ) );
            ?>
    </ol>

    <?php the_comments_navigation( array(
            'prev_text' => '< [ 载入旧记录 ]',
            'next_text' => '[ 载入新记录 ] >',
        ) ); ?>

    <?php endif; // 结束 have_comments() 判断 ?>

    <?php
    // 自定义表单参数，彻底工业化
    $commenter = wp_get_current_commenter();
    $req       = get_option( 'require_name_email' );
    $aria_req  = ( $req ? " aria-required='true' required='required'" : '' );

    $fields =  array(
        'author' => '<div class="terminal-input-group"><label for="author">ID标识 ' . ( $req ? '<span class="required">*</span>' : '' ) . '</label>' .
                    '<input id="author" name="author" type="text" value="' . esc_attr( $commenter['comment_author'] ) . '" size="30"' . $aria_req . ' placeholder="输入您的代号" /></div>',
        'email'  => '<div class="terminal-input-group"><label for="email">回传节点 ' . ( $req ? '<span class="required">*</span>' : '' ) . '</label>' .
                    '<input id="email" name="email" type="text" value="' . esc_attr( $commenter['comment_author_email'] ) . '" size="30"' . $aria_req . ' placeholder="输入您的邮箱" /></div>',
        'url'    => '<div class="terminal-input-group"><label for="url">溯源地址</label>' .
                    '<input id="url" name="url" type="text" value="' . esc_attr( $commenter['comment_author_url'] ) . '" size="30" placeholder="输入您的站点 (可选)" /></div>',
    );

    $comments_args = array(
        'title_reply'          => '[ 发起通讯连接 / INITIATE COMM-LINK ]',
        'title_reply_to'       => '[ 接入频道：回复 %s ]',
        'cancel_reply_link'    => '[ 中止连接 / ABORT ]',
        'label_submit'         => '[ 传输数据 / TRANSMIT ]',
        'class_submit'         => 'terminal-submit-btn',
        'comment_field'        => '<div class="terminal-input-group comment-textarea-group"><label for="comment" class="prompt-symbol">C:\> 待发送报文：</label><textarea id="comment" name="comment" cols="45" rows="6" aria-required="true" required="required" placeholder="输入指令或留言..."></textarea></div>',
        'fields'               => apply_filters( 'comment_form_default_fields', $fields ),
        'comment_notes_before' => '<p class="comment-notes">[SYS]: 您的回传节点（邮箱）将被严格保密。带有 <span class="required">*</span> 的字段为必填项。</p>',
    );

    comment_form( $comments_args );
    ?>

</div>