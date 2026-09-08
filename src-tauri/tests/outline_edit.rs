use papercompile_core::outline::{add_section, delete_section, extract_outline, rename_section};

#[test]
fn renames_section_in_place() {
    let source = "\\section{Old}\nText";
    let item = &extract_outline(&[("main.tex".into(), source.into())])[0];
    assert_eq!(
        rename_section(source, item, "New").unwrap(),
        "\\section{New}\nText"
    );
}

#[test]
fn adds_section_after_target() {
    let source = "\\section{Intro}\nText\n\\section{Results}\nMore";
    let item = &extract_outline(&[("main.tex".into(), source.into())])[0];
    assert_eq!(
        add_section(source, item, "Method").unwrap(),
        "\\section{Intro}\nText\n\\section{Method}\n\\section{Results}\nMore"
    );
}

#[test]
fn deletes_section_and_nested_children_but_keeps_next_sibling() {
    let source = "\\section{Intro}\n\\subsection{Background}\nText\n\\section{Results}\nMore";
    let items = extract_outline(&[("main.tex".into(), source.into())]);
    assert_eq!(
        delete_section(source, &items[0], &items).unwrap(),
        "\\section{Results}\nMore"
    );
}
