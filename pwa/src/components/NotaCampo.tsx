import { useEffect, useRef, useState } from "react";

export function NotaCampo({
  value,
  readOnly = false,
  rows = 2,
  placeholder,
  className,
  onChange,
}: {
  value: string;
  readOnly?: boolean;
  rows?: number;
  placeholder: string;
  className?: string;
  onChange: (texto: string) => void;
}) {
  const [texto, setTexto] = useState(value);
  const foco = useRef(false);

  useEffect(() => {
    if (!foco.current) setTexto(value);
  }, [value]);

  return (
    <textarea
      rows={rows}
      className={className}
      placeholder={placeholder}
      value={texto}
      readOnly={readOnly}
      onFocus={() => {
        foco.current = true;
      }}
      onBlur={() => {
        foco.current = false;
        if (texto !== value) onChange(texto);
      }}
      onChange={(event) => {
        const proximo = event.target.value;
        setTexto(proximo);
        onChange(proximo);
      }}
    />
  );
}
