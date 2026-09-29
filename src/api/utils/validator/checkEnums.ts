import { needExist } from ".";

interface ICheckEnums {
  enumType: Record<string, string>;
  value: string;
  label: string;
}

export function checkEnums(data: ICheckEnums[]) {
  data.forEach(({ enumType, label, value }) => {
    const isValid = enumType[value];
    needExist([{ label, variable: isValid }]);
  });
}
