use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum LatexNodeKind {
    Part,
    Chapter,
    Section,
    Subsection,
    Subsubsection,
    Paragraph,
    Bold,
    Italic,
    DisplayMath,
    ListItem,
    Image,
    Caption,
    RawLatex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InlineMark {
    Plain,
    Bold,
    Italic,
}

pub fn inline_to_latex(text: &str, mark: InlineMark) -> String {
    let escaped = escape_text(text);
    match mark {
        InlineMark::Plain => escaped,
        InlineMark::Bold => format!("\\textbf{{{escaped}}}"),
        InlineMark::Italic => format!("\\textit{{{escaped}}}"),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LatexNode {
    pub id: String,
    pub file: String,
    pub kind: LatexNodeKind,
    pub text: String,
    pub raw: String,
    pub start: usize,
    pub end: usize,
    pub children: Vec<LatexNode>,
    pub display: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum VisualEditError {
    #[error("node is not safely editable")]
    UnsupportedNode,
    #[error("node range is invalid")]
    InvalidRange,
}

pub fn edit_node_text(
    source: &str,
    node: &LatexNode,
    text: &str,
) -> Result<String, VisualEditError> {
    if node.end > source.len() || node.start > node.end {
        return Err(VisualEditError::InvalidRange);
    }
    let replacement = match node.kind {
        LatexNodeKind::Paragraph
            if node
                .children
                .iter()
                .all(|child| child.kind == LatexNodeKind::Paragraph) =>
        {
            escape_text(text)
        }
        LatexNodeKind::Part
        | LatexNodeKind::Chapter
        | LatexNodeKind::Section
        | LatexNodeKind::Subsection
        | LatexNodeKind::Subsubsection => {
            let command = match node.kind {
                LatexNodeKind::Part => "part",
                LatexNodeKind::Chapter => "chapter",
                LatexNodeKind::Section => "section",
                LatexNodeKind::Subsection => "subsection",
                LatexNodeKind::Subsubsection => "subsubsection",
                _ => unreachable!(),
            };
            format!("\\{command}{{{}}}", escape_text(text))
        }
        _ => return Err(VisualEditError::UnsupportedNode),
    };
    let mut updated = source.to_string();
    updated.replace_range(node.start..node.end, &replacement);
    Ok(updated)
}

fn escape_text(text: &str) -> String {
    text.chars()
        .map(|character| match character {
            '\\' => "\\textbackslash{}".into(),
            '%' => "\\%".into(),
            '#' => "\\#".into(),
            '$' => "\\$".into(),
            '&' => "\\&".into(),
            '_' => "\\_".into(),
            '{' => "\\{".into(),
            '}' => "\\}".into(),
            '~' => "\\textasciitilde{}".into(),
            '^' => "\\textasciicircum{}".into(),
            other => other.to_string(),
        })
        .collect()
}

pub fn project_latex(path: &str, source: &str) -> Vec<LatexNode> {
    let (body, base) = match (
        source.find("\\begin{document}"),
        source.rfind("\\end{document}"),
    ) {
        (Some(begin), Some(end)) if begin < end => {
            let start = begin + "\\begin{document}".len();
            (&source[start..end], start)
        }
        _ => (source, 0),
    };
    let mut nodes = Vec::new();
    if let Some(environment) = leading_environment(body) {
        if !is_visual_environment(environment) {
            return vec![node(
                LatexNodeKind::RawLatex,
                body.to_string(),
                body.to_string(),
                base,
                base + body.len(),
                vec![],
                path,
            )];
        }
    }
    let mut paragraph_start = None;
    for (line_start, line) in body.split_inclusive('\n').scan(0, |offset, line| {
        let start = *offset;
        *offset += line.len();
        Some((start, line))
    }) {
        let content = line.trim_end_matches('\n').trim_end_matches('\r');
        let trimmed = content.trim();
        let is_boundary = trimmed.is_empty()
            || trimmed.starts_with('%')
            || trimmed.starts_with("\\part{")
            || trimmed.starts_with("\\chapter{")
            || trimmed.starts_with("\\section{")
            || trimmed.starts_with("\\subsection{")
            || trimmed.starts_with("\\subsubsection{")
            || trimmed.starts_with("\\[")
            || trimmed.starts_with("\\begin{")
            || trimmed.starts_with("\\end{")
            || trimmed.starts_with("\\item")
            || trimmed.starts_with("\\includegraphics")
            || trimmed.starts_with("\\caption{")
            || trimmed.starts_with("\\label{")
            || trimmed.starts_with("\\input{")
            || trimmed.starts_with("\\include{")
            || trimmed.starts_with("\\bibliography{");
        if is_boundary {
            if let Some(start) = paragraph_start.take() {
                add_paragraph(&mut nodes, body, start, line_start, base, path);
            }
            if let Some((command, kind)) = heading_command(trimmed) {
                let end = line_start + content.len();
                nodes.push(node(
                    kind,
                    braced_text(trimmed, command).unwrap_or_default(),
                    body[line_start..end].to_string(),
                    base + line_start,
                    base + end,
                    vec![],
                    path,
                ));
            } else if trimmed.starts_with("\\[") {
                let end = line_start + content.len();
                nodes.push(node(
                    LatexNodeKind::DisplayMath,
                    trimmed
                        .trim_start_matches("\\[")
                        .trim_end_matches("\\]")
                        .trim()
                        .to_string(),
                    body[line_start..end].to_string(),
                    base + line_start,
                    base + end,
                    vec![],
                    path,
                ));
            } else if let Some(text) = trimmed.strip_prefix("\\item") {
                let command_start = content.find("\\item").unwrap_or_default();
                let end = line_start + content.len();
                nodes.push(node(
                    LatexNodeKind::ListItem,
                    text.trim_start().to_string(),
                    body[line_start + command_start..end].to_string(),
                    base + line_start + command_start,
                    base + end,
                    vec![],
                    path,
                ));
            } else if trimmed.starts_with("\\includegraphics") {
                let command_start = content.find("\\includegraphics").unwrap_or_default();
                let end = line_start + content.len();
                nodes.push(node(
                    LatexNodeKind::Image,
                    last_braced_argument(trimmed).unwrap_or_default(),
                    body[line_start + command_start..end].to_string(),
                    base + line_start + command_start,
                    base + end,
                    vec![],
                    path,
                ));
            } else if trimmed.starts_with("\\caption{") {
                let command_start = content.find("\\caption{").unwrap_or_default();
                let end = line_start + content.len();
                nodes.push(node(
                    LatexNodeKind::Caption,
                    braced_text(trimmed, "\\caption{").unwrap_or_default(),
                    body[line_start + command_start..end].to_string(),
                    base + line_start + command_start,
                    base + end,
                    vec![],
                    path,
                ));
            }
        } else if trimmed.starts_with('\\') {
            if let Some(start) = paragraph_start.take() {
                add_paragraph(&mut nodes, body, start, line_start, base, path);
            }
            let end = line_start + content.len();
            nodes.push(node(
                LatexNodeKind::RawLatex,
                content.to_string(),
                content.to_string(),
                base + line_start,
                base + end,
                vec![],
                path,
            ));
        } else if paragraph_start.is_none() {
            paragraph_start = Some(line_start);
        }
    }
    if let Some(start) = paragraph_start {
        add_paragraph(&mut nodes, body, start, body.len(), base, path);
    }
    let mut section_number = [0_u32; 5];
    for node in &mut nodes {
        if let Some(level) = heading_level(node.kind.clone()) {
            section_number[level] += 1;
            for value in section_number.iter_mut().skip(level + 1) {
                *value = 0;
            }
            let numbers = section_number[..=level]
                .iter()
                .filter(|value| **value > 0)
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(".");
            node.display = format!("{numbers} {}", node.text);
        } else {
            node.display = node.text.clone();
        }
    }
    nodes
}

fn leading_environment(value: &str) -> Option<&str> {
    let value = value.trim_start();
    let rest = value.strip_prefix("\\begin{")?;
    let end = rest.find('}')?;
    Some(&rest[..end])
}

fn is_visual_environment(environment: &str) -> bool {
    matches!(
        environment,
        "abstract"
            | "itemize"
            | "enumerate"
            | "description"
            | "figure"
            | "figure*"
            | "table"
            | "table*"
            | "center"
            | "flushleft"
            | "flushright"
            | "quote"
            | "quotation"
    )
}

fn add_paragraph(
    nodes: &mut Vec<LatexNode>,
    source: &str,
    start: usize,
    end: usize,
    base: usize,
    path: &str,
) {
    let raw = source[start..end].trim_end_matches(['\n', '\r']);
    let actual_end = start + raw.len();
    if !visible_text(raw).trim().is_empty() {
        let children = inline_nodes(raw, base + start, path);
        nodes.push(node(
            LatexNodeKind::Paragraph,
            children
                .iter()
                .map(|child| child.text.as_str())
                .collect::<String>(),
            raw.to_string(),
            base + start,
            base + actual_end,
            children,
            path,
        ));
    }
}

fn node(
    kind: LatexNodeKind,
    text: String,
    raw: String,
    start: usize,
    end: usize,
    children: Vec<LatexNode>,
    file: &str,
) -> LatexNode {
    let display = text.clone();
    LatexNode {
        id: crate::outline::navigation_id(file, start, end),
        file: file.to_string(),
        kind,
        text,
        raw,
        start,
        end,
        children,
        display,
    }
}

fn heading_command(value: &str) -> Option<(&'static str, LatexNodeKind)> {
    [
        ("\\part{", LatexNodeKind::Part),
        ("\\chapter{", LatexNodeKind::Chapter),
        ("\\section{", LatexNodeKind::Section),
        ("\\subsection{", LatexNodeKind::Subsection),
        ("\\subsubsection{", LatexNodeKind::Subsubsection),
    ]
    .into_iter()
    .find(|(command, _)| value.starts_with(command))
}
fn heading_level(kind: LatexNodeKind) -> Option<usize> {
    match kind {
        LatexNodeKind::Part => Some(0),
        LatexNodeKind::Chapter => Some(0),
        LatexNodeKind::Section => Some(1),
        LatexNodeKind::Subsection => Some(2),
        LatexNodeKind::Subsubsection => Some(3),
        _ => None,
    }
}

fn braced_text(value: &str, prefix: &str) -> Option<String> {
    let value = value.strip_prefix(prefix)?;
    let mut depth = 1;
    for (index, character) in value.char_indices() {
        if character == '{' {
            depth += 1;
        } else if character == '}' {
            depth -= 1;
            if depth == 0 {
                return Some(value[..index].to_string());
            }
        }
    }
    None
}

fn last_braced_argument(value: &str) -> Option<String> {
    let open = value.rfind('{')?;
    let close = matching_brace(value, open)?;
    Some(value[open + 1..close].to_string())
}

fn matching_brace(value: &str, open: usize) -> Option<usize> {
    let mut depth = 0;
    for (index, character) in value.char_indices().skip_while(|(index, _)| *index < open) {
        if character == '{' {
            depth += 1;
        } else if character == '}' {
            depth -= 1;
            if depth == 0 {
                return Some(index);
            }
        }
    }
    None
}

fn visible_text(value: &str) -> String {
    value
        .lines()
        .map(|line| match line.split_once('%') {
            Some((text, _)) => text.trim_end(),
            None => line,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn inline_nodes(value: &str, base: usize, file: &str) -> Vec<LatexNode> {
    let mut children = Vec::new();
    let mut cursor = 0;
    while cursor < value.len() {
        let next = ["\\textbf{", "\\textit{"]
            .iter()
            .filter_map(|marker| {
                value[cursor..]
                    .find(marker)
                    .map(|offset| (cursor + offset, *marker))
            })
            .min_by_key(|(start, _)| *start);
        let Some((start, marker)) = next else { break };
        if start > cursor {
            let text = visible_text(&value[cursor..start]);
            if !text.is_empty() {
                children.push(node(
                    LatexNodeKind::Paragraph,
                    text,
                    value[cursor..start].to_string(),
                    base + cursor,
                    base + start,
                    vec![],
                    file,
                ));
            }
        }
        let content_start = start + marker.len() - 1;
        let Some(close) = matching_brace(value, content_start) else {
            break;
        };
        let kind = if marker == "\\textbf{" {
            LatexNodeKind::Bold
        } else {
            LatexNodeKind::Italic
        };
        children.push(node(
            kind,
            value[content_start + 1..close].to_string(),
            value[start..close + 1].to_string(),
            base + start,
            base + close + 1,
            vec![],
            file,
        ));
        cursor = close + 1;
    }
    if cursor < value.len() {
        let text = visible_text(&value[cursor..]);
        if !text.is_empty() {
            children.push(node(
                LatexNodeKind::Paragraph,
                text,
                value[cursor..].to_string(),
                base + cursor,
                base + value.len(),
                vec![],
                file,
            ));
        }
    }
    children
}
