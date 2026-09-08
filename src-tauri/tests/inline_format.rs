use papercompile_core::latex::{InlineMark, inline_to_latex};

#[test]
fn serializes_plain_bold_and_italic_text_to_supported_latex() {
    assert_eq!(inline_to_latex("hello", InlineMark::Plain), "hello");
    assert_eq!(
        inline_to_latex("hello", InlineMark::Bold),
        "\\textbf{hello}"
    );
    assert_eq!(
        inline_to_latex("hello", InlineMark::Italic),
        "\\textit{hello}"
    );
}

#[test]
fn escapes_special_characters_inside_inline_format() {
    assert_eq!(inline_to_latex("50%", InlineMark::Bold), "\\textbf{50\\%}");
}
